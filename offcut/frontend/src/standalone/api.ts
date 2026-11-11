// The standalone build's API: the Go service's behaviour, in the browser, with
// the demo provider. It lets the app run as a static page with no server. The
// real API is the contract; this follows it, route by route.
import type {
  ConversationEntry,
  Pending,
  Photo,
  Project,
  ProjectSummary,
  Reference,
  Settings,
  Spec,
  SpecVersion,
} from '@/api';
import { ApiError, setPhotoUrl } from '@/api/fetcher';
// The same bedside table the Go demo provider returns.
// eslint-disable-next-line no-restricted-imports
import example from '../../../backend/internal/spec/examples/bedside_table.json';
import { validate } from './validate';

const DEMO_DELAY_MS = 1500;
const STORAGE_KEY = 'offcut-standalone-v1';

type StoredPhoto = { id: string; view: string; dataUrl: string; sent: boolean; createdAt: string };
type StoredProject = {
  id: string;
  name: string;
  status: Project['status'];
  error: string;
  reference?: Reference;
  notes: string;
  pending?: Pending;
  asked: boolean;
  photos: StoredPhoto[];
  specs: SpecVersion[];
  conversation: ConversationEntry[];
  createdAt: string;
  updatedAt: string;
};
type Db = { projects: StoredProject[]; settings: Omit<Settings, 'defaultModel'> };

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const exampleSpec = () => structuredClone(example) as Spec;

function seed(): Db {
  const t = now();
  const spec = exampleSpec();
  return {
    settings: { provider: 'demo', model: '', baseUrl: '', hasKey: false, stockThicknesses: [6, 9, 12, 15, 18, 25] },
    projects: [
      {
        id: uid(),
        name: 'Bedside table (example)',
        status: 'ready',
        error: '',
        reference: { label: 'Top width', mm: 450 },
        notes: '',
        asked: true,
        photos: [],
        specs: [{ version: 1, source: 'ai', spec, issues: validate(spec), createdAt: t }],
        conversation: [],
        createdAt: t,
        updatedAt: t,
      },
    ],
  };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Db;
      // An analysis can't survive a reload; the Go server fails interrupted runs the same way.
      for (const p of db.projects) {
        if (p.status === 'analyzing') Object.assign(p, { status: 'failed', error: 'The page was reloaded during the analysis.' });
      }
      return db;
    }
  } catch {
    // storage blocked or unreadable: start fresh
  }
  return seed();
}

const db = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Photos can outgrow the quota; keep without them rather than lose everything.
    try {
      const lite = { ...db, projects: db.projects.map((p) => ({ ...p, photos: p.photos.map((ph) => ({ ...ph, dataUrl: '' })) })) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lite));
    } catch {
      // storage blocked: the session still works in memory
    }
  }
}

setPhotoUrl((id) => {
  for (const p of db.projects) {
    const ph = p.photos.find((x) => x.id === id);
    if (ph) return ph.dataUrl;
  }
  return '';
});

const notFound = () => new ApiError(404, 'Not found.');
const invalid = (msg: string) => new ApiError(400, msg);

function project(id: string): StoredProject {
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw notFound();
  return p;
}

const latest = (p: StoredProject) => p.specs.at(-1);

const toPhoto = (ph: StoredPhoto): Photo => ({ id: ph.id, view: ph.view, url: ph.dataUrl, sent: ph.sent, createdAt: ph.createdAt });

function toProject(p: StoredProject): Project {
  const spec = latest(p);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    error: p.error,
    notes: p.notes,
    ...(p.reference ? { reference: p.reference } : {}),
    ...(p.pending ? { pending: p.pending } : {}),
    ...(spec ? { spec } : {}),
    photos: p.photos.map(toPhoto),
    conversation: p.conversation,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toSummary(p: StoredProject): ProjectSummary {
  const spec = latest(p);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    photoCount: p.photos.length,
    ...(p.photos[0] ? { coverPhotoId: p.photos[0].id } : {}),
    ...(spec ? { overall: spec.spec.overall } : {}),
    partCount: spec?.spec.parts.length ?? 0,
    pendingCount: p.pending ? p.pending.shots.length + p.pending.questions.length : 0,
    updatedAt: p.updatedAt,
  };
}

function touch(p: StoredProject) {
  p.updatedAt = now();
  save();
}

const viewList = (photos: StoredPhoto[]) => photos.map((ph) => ph.view || 'unlabelled');

type AnalyzeBody = { reference?: Reference; notes?: string; answers?: string[]; skip?: boolean };

function analyze(p: StoredProject, body: AnalyzeBody): Project {
  if (db.settings.provider !== 'demo') {
    throw invalid('This preview runs in your browser with no server, so it can only use the demo. Choose Demo in Settings, or run the app locally to use a real AI.');
  }
  if (p.status === 'analyzing') throw new ApiError(409, 'An analysis is already running.');
  if (body.reference) {
    if (!(body.reference.mm > 0) || !body.reference.label.trim()) {
      throw invalid('The reference measurement needs a label and a length in millimetres.');
    }
    p.reference = body.reference;
  }
  const notes = body.notes?.trim() ?? '';
  const fresh = p.photos.filter((ph) => !ph.sent);
  const lines: string[] = [];

  if (p.conversation.length === 0) {
    if (p.photos.length === 0) throw invalid('Add at least one photo first.');
    if (!p.reference) throw invalid('Add one real measurement, so the photos have a scale.');
    if (notes) p.notes = notes;
    const n = p.photos.length;
    lines.push(`Here ${n === 1 ? 'is a photo' : `are ${n} photos`} of the piece I want to build:`);
    viewList(p.photos).forEach((v, i) => lines.push(`- Photo ${i + 1}: ${v}`));
    lines.push('', `Reference measurement: ${p.reference.label} is ${p.reference.mm} mm.`);
    if (p.notes) lines.push('', `Notes: ${p.notes}`);
  } else {
    const replying = p.status === 'needs_input';
    const retry = p.status === 'failed' && p.conversation.at(-1)?.role === 'user';
    if (replying && body.skip) lines.push("The user can't provide this. Continue with sensible assumptions and record them.");
    if (fresh.length) lines.push(`I've added ${fresh.length === 1 ? 'a photo' : `${fresh.length} photos`}:`, ...viewList(fresh).map((v) => `- ${v}`));
    if (body.reference) lines.push(`Reference measurement: ${body.reference.label} is ${body.reference.mm} mm.`);
    if (notes) lines.push(notes);
    if (!replying && !retry) {
      if (lines.length === 0) throw invalid('Add a photo or a note to tell the AI what to change.');
      lines.push('Update the spec to match, and submit it again.');
    }
    if (replying && lines.length === 0) throw invalid('Add the photos or answers the AI asked for, or skip them.');
  }

  for (const ph of p.photos) ph.sent = true;
  if (lines.length) p.conversation.push({ role: 'user', text: lines.join('\n') });
  Object.assign(p, { status: 'analyzing', error: '', pending: undefined });
  touch(p);
  setTimeout(() => runDemo(p.id), DEMO_DELAY_MS);
  return toProject(p);
}

// The demo provider: with fewer than three photos it asks for a side and a
// back shot, once; then it submits the example bedside table.
function runDemo(id: string) {
  const p = db.projects.find((x) => x.id === id);
  if (!p || p.status !== 'analyzing') return;
  const sent = p.photos.filter((ph) => ph.sent).length;
  if (sent < 3 && !p.asked) {
    const message = 'I can see the front, a drawer and a shelf. Two things that change the parts list are hidden.';
    p.asked = true;
    p.pending = {
      message,
      shots: [
        { view: 'Side, straight on', reason: 'To get the depth and see whether the shelf sits in a groove.' },
        { view: 'The back', reason: "To see whether there's a back panel and how it's fixed." },
      ],
      questions: [],
    };
    p.status = 'needs_input';
    p.conversation.push({ role: 'assistant', text: message });
  } else {
    const spec = exampleSpec();
    p.specs.push({ version: p.specs.length + 1, source: 'ai', spec, issues: validate(spec, db.settings.stockThicknesses), createdAt: now() });
    p.status = 'ready';
    p.conversation.push({ role: 'assistant', text: "Here is the spec. I've designed the joinery, since it isn't visible." });
  }
  touch(p);
}

const PHOTO_TYPES: Record<string, string> = {
  'ffd8ff': 'image/jpeg',
  '89504e47': 'image/png',
  '47494638': 'image/gif',
  '52494646': 'image/webp',
};

async function addPhoto(p: StoredProject, form: FormData): Promise<Photo> {
  const file = form.get('file');
  if (!(file instanceof Blob)) throw invalid('Send the photo as the multipart field "file".');
  if (file.size === 0) throw invalid('The photo is empty.');
  if (file.size > 5 << 20) throw invalid('The photo is larger than 5 MB.');
  // Trust the bytes, not the browser's label.
  const head = [...new Uint8Array(await file.slice(0, 4).arrayBuffer())].map((b) => b.toString(16).padStart(2, '0')).join('');
  const type = PHOTO_TYPES[head] ?? PHOTO_TYPES[head.slice(0, 6)];
  if (!type) throw invalid('Upload a JPEG, PNG, WebP or GIF photo.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;/, `data:${type};`));
    r.onerror = () => reject(invalid("The photo couldn't be read."));
    r.readAsDataURL(file);
  });
  const view = String(form.get('view') ?? '').trim();
  const ph: StoredPhoto = { id: uid(), view, dataUrl, sent: false, createdAt: now() };
  p.photos.push(ph);
  touch(p);
  return toPhoto(ph);
}

const settingsView = (): Settings => ({ ...db.settings, defaultModel: 'claude-opus-5-5' });

type Route = [method: string, pattern: RegExp, handle: (m: string[], body: unknown) => unknown];

const routes: Route[] = [
  ['GET', /^\/projects$/, () => [...db.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(toSummary)],
  ['POST', /^\/projects$/, (_, body) => {
    const t = now();
    const name = String((body as { name?: string }).name ?? '').trim() || 'Untitled piece';
    const p: StoredProject = { id: uid(), name, status: 'draft', error: '', notes: '', asked: false, photos: [], specs: [], conversation: [], createdAt: t, updatedAt: t };
    db.projects.push(p);
    save();
    return toProject(p);
  }],
  ['GET', /^\/projects\/([^/]+)$/, ([id]) => toProject(project(id!))],
  ['PATCH', /^\/projects\/([^/]+)$/, ([id], body) => {
    const p = project(id!);
    const name = String((body as { name?: string }).name ?? '').trim();
    if (!name) throw invalid("The name can't be empty.");
    p.name = name;
    touch(p);
    return toProject(p);
  }],
  ['DELETE', /^\/projects\/([^/]+)$/, ([id]) => {
    project(id!);
    db.projects = db.projects.filter((x) => x.id !== id);
    save();
  }],
  ['POST', /^\/projects\/([^/]+)\/photos$/, ([id], body) => addPhoto(project(id!), body as FormData)],
  ['POST', /^\/projects\/([^/]+)\/analyze$/, ([id], body) => analyze(project(id!), body as AnalyzeBody)],
  ['PUT', /^\/projects\/([^/]+)\/spec$/, ([id], body) => {
    const p = project(id!);
    const spec = (body as { spec: Spec }).spec;
    const v: SpecVersion = { version: p.specs.length + 1, source: 'user', spec, issues: validate(spec, db.settings.stockThicknesses), createdAt: now() };
    p.specs.push(v);
    touch(p);
    return v;
  }],
  ['DELETE', /^\/photos\/([^/]+)$/, ([id]) => {
    const p = db.projects.find((x) => x.photos.some((ph) => ph.id === id));
    if (!p) throw notFound();
    if (p.photos.find((ph) => ph.id === id)!.sent) throw new ApiError(409, 'Conflict: the AI has already seen this photo');
    p.photos = p.photos.filter((ph) => ph.id !== id);
    touch(p);
  }],
  ['POST', /^\/spec\/validate$/, (_, body) => ({ issues: validate((body as { spec: Spec }).spec, db.settings.stockThicknesses) })],
  ['GET', /^\/settings$/, settingsView],
  ['PUT', /^\/settings$/, (_, body) => {
    const b = body as Partial<Settings> & { apiKey?: string };
    if (b.provider === 'openai' && !b.model?.trim()) throw invalid('Name the model to use with an OpenAI-compatible provider.');
    Object.assign(db.settings, {
      provider: b.provider ?? db.settings.provider,
      model: b.model?.trim() ?? '',
      baseUrl: b.baseUrl?.trim() ?? '',
      stockThicknesses: b.stockThicknesses?.length ? b.stockThicknesses : db.settings.stockThicknesses,
    });
    // The key itself is never kept here: this preview has no server to send it to.
    if (b.apiKey !== undefined) db.settings.hasKey = b.apiKey !== '';
    save();
    return settingsView();
  }],
  ['POST', /^\/settings\/test$/, () =>
    db.settings.provider === 'demo'
      ? { ok: true, message: 'The demo answers without an AI.', latencyMs: 0 }
      : { ok: false, message: 'This preview runs in your browser with no server, so it can\'t reach a real AI. Run the app locally for that.', latencyMs: 0 }],
];

export async function mockFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const path = url.replace(/^\/api/, '').split('?')[0]!;
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: unknown = init?.body;
  if (typeof body === 'string') body = JSON.parse(body);
  for (const [m, pattern, handle] of routes) {
    const match = m === method ? pattern.exec(path) : null;
    if (match) return (await handle(match.slice(1), body ?? {})) as T;
  }
  throw notFound();
}
