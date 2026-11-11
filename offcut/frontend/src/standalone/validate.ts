// A TypeScript copy of backend/internal/spec/validate.go, for the standalone
// build, which has no server. Keep the two in step: same checks, same codes,
// same messages.
import type { Hardware, Issue, Part, Spec, Vec3 } from '@/api';

export const TOLERANCE = 0.5;
export const MAX_RUNNER_GAP = 20;
export const DEFAULT_STOCK_THICKNESSES = [6, 9, 12, 15, 18, 25];
const JOINT_METHODS = ['screw', 'pocket_screw', 'dowel', 'glue', 'groove', 'cam_lock', 'brad_nail', 'runner'];

type Box = { min: [number, number, number]; max: [number, number, number] };

const boxOf = (p: Part): Box => ({
  min: [p.position.x, p.position.y, p.position.z],
  max: [p.position.x + p.size.x, p.position.y + p.size.y, p.position.z + p.size.z],
});

const overlapOn = (a: Box, b: Box, i: number) => Math.min(a.max[i]!, b.max[i]!) - Math.max(a.min[i]!, b.min[i]!);

function penetration(a: Box, b: Box): number[] | null {
  const d = [0, 1, 2].map((i) => overlapOn(a, b, i));
  return d.every((x) => x > TOLERANCE) ? d : null;
}

function facing(a: Box, b: Box, maxGap: number): boolean {
  let gaps = 0;
  for (let i = 0; i < 3; i++) {
    const o = overlapOn(a, b, i);
    if (o > TOLERANCE) continue;
    if (o >= -maxGap - TOLERANCE) gaps++;
    else return false;
  }
  return gaps === 1;
}

function touching(a: Box, b: Box): boolean {
  let meet = 0;
  for (let i = 0; i < 3; i++) {
    const o = overlapOn(a, b, i);
    if (o > TOLERANCE) continue;
    if (Math.abs(o) <= TOLERANCE) meet++;
    else return false;
  }
  return meet === 1;
}

const fmtMM = (f: number) => (Math.abs(f - Math.round(f)) < 0.05 ? f.toFixed(0) : f.toFixed(1));
const fmtVec = (v: Vec3) => `${fmtMM(v.x)},${fmtMM(v.y)},${fmtMM(v.z)}`;
const q = (s: string) => JSON.stringify(s);
const quoteAll = (ids: string[]) => ids.map(q).join(', ');
const thicknessOf = (p: Part) => Math.min(p.size.x, p.size.y, p.size.z);

export function validate(s: Spec, stock: number[] = DEFAULT_STOCK_THICKNESSES): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: 'error' | 'warning', code: string, path: string, message: string, ...parts: string[]) =>
    issues.push({ severity, code, path, message, ...(parts.length ? { parts } : {}) });
  if (stock.length === 0) stock = DEFAULT_STOCK_THICKNESSES;

  for (const [name, dim] of [['width', s.overall.width], ['height', s.overall.height], ['depth', s.overall.depth]] as const) {
    if (dim.value <= 0) add('error', 'overall_size', `overall.${name}`, `Overall ${name} must be greater than 0.`);
  }

  const parts = new Map<string, Part>();
  if (s.parts.length === 0) {
    add('error', 'no_parts', 'parts', 'The spec has no parts.');
  }
  s.parts.forEach((p, i) => {
    const path = `parts[${i}]`;
    if (p.id.trim() === '') return add('error', 'part_id', `${path}.id`, `Part ${i} (${q(p.name)}) has no id.`);
    if (parts.has(p.id)) return add('error', 'duplicate_part', `${path}.id`, `Part id ${q(p.id)} is used more than once. Ids must be unique.`, p.id);
    if (p.size.x < 1 || p.size.y < 1 || p.size.z < 1) {
      return add('error', 'part_size', `${path}.size`, `Part ${q(p.id)} has size ${fmtVec(p.size)}; every extent must be at least 1 mm.`, p.id);
    }
    parts.set(p.id, p);
  });
  const valid = s.parts.filter((p) => parts.get(p.id) === p);

  if (valid.length > 0) {
    const boxes = valid.map(boxOf);
    const min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]!)));
    const max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]!)));
    if (min.some((m) => Math.abs(m) > TOLERANCE)) {
      add('error', 'origin', 'parts', `The parts start at ${fmtVec({ x: min[0]!, y: min[1]!, z: min[2]! })}; the front-left-bottom corner of the piece must be at 0,0,0.`);
    }
    const axes = [
      ['width', 'x', s.overall.width.value],
      ['height', 'y', s.overall.height.value],
      ['depth', 'z', s.overall.depth.value],
    ] as const;
    axes.forEach(([name, axis, want], i) => {
      const got = max[i]! - min[i]!;
      if (Math.abs(got - want) > TOLERANCE) {
        add('error', 'overall_mismatch', `overall.${name}`, `The parts span ${fmtMM(got)} mm in ${name} (${axis}), but the overall ${name} is ${fmtMM(want)} mm.`);
      }
    });

    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i]!, b = valid[j]!;
        const d = penetration(boxes[i]!, boxes[j]!);
        if (!d) continue;
        add('error', 'overlap', 'parts',
          `${q(a.id)} and ${q(b.id)} occupy the same space (they overlap by ${fmtMM(d[0]!)} mm in x, ${fmtMM(d[1]!)} mm in y and ${fmtMM(d[2]!)} mm in z). Shorten one of them, usually by the other's thickness.`,
          a.id, b.id);
      }
    }

    for (const p of valid) {
      const t = thicknessOf(p);
      if (stock.some((st) => Math.abs(st - t) <= TOLERANCE)) continue;
      add('warning', 'stock_thickness', `parts.${p.id}`,
        `${q(p.id)} is ${fmtMM(t)} mm thick, which is not a stock thickness (${stock.map(fmtMM).join(', ')}). Check it, or plan to buy or plane a board to this size.`, p.id);
    }
  }

  const hw = new Map<string, Hardware>();
  s.hardware.forEach((h, i) => {
    const path = `hardware[${i}]`;
    if (h.id.trim() === '') add('error', 'hardware_id', `${path}.id`, `Hardware ${q(h.name)} has no id.`);
    else if (hw.has(h.id)) add('error', 'duplicate_hardware', `${path}.id`, `Hardware id ${q(h.id)} is used more than once.`);
    else if (h.quantity < 1) add('error', 'hardware_quantity', `${path}.quantity`, `Hardware ${q(h.id)} needs a quantity of at least 1.`);
    else hw.set(h.id, h);
  });

  const used = new Map<string, number>();
  s.joints.forEach((j, i) => {
    const path = `joints[${i}]`;
    const a = parts.get(j.a), b = parts.get(j.b);
    if (!a || !b) {
      for (const id of [j.a, j.b]) {
        if (!parts.has(id)) add('error', 'joint_unknown_part', path, `Joint ${i} refers to part ${q(id)}, which does not exist.`);
      }
      return;
    }
    if (j.a === j.b) return add('error', 'joint_self', path, `Joint ${i} joins ${q(j.a)} to itself.`, j.a);
    if (!JOINT_METHODS.includes(j.method)) {
      add('error', 'joint_method', `${path}.method`, `Joint ${i} uses method ${q(j.method)}; use one of ${JOINT_METHODS.join(', ')}.`, j.a, j.b);
    }
    if (j.method === 'runner') {
      if (!facing(boxOf(a), boxOf(b), MAX_RUNNER_GAP)) {
        add('error', 'runner_gap', path,
          `Runner joint ${i} needs ${q(j.a)} and ${q(j.b)} to face each other across a gap of up to ${fmtMM(MAX_RUNNER_GAP)} mm (side-mounted runners need about 12.5 mm). They don't.`, j.a, j.b);
      }
    } else if (!touching(boxOf(a), boxOf(b))) {
      add('error', 'joint_not_touching', path,
        `Joint ${i} joins ${q(j.a)} and ${q(j.b)}, but they do not share a face, so they cannot be joined. Move one part, or join different parts.`, j.a, j.b);
    }
    if (j.hardware) {
      if (!hw.has(j.hardware)) {
        add('error', 'joint_unknown_hardware', `${path}.hardware`, `Joint ${i} uses hardware ${q(j.hardware)}, which is not in the hardware list.`, j.a, j.b);
      } else {
        used.set(j.hardware, (used.get(j.hardware) ?? 0) + Math.max(j.count ?? 0, 1));
      }
    }
  });
  for (const [id, n] of used) {
    const have = hw.get(id)!.quantity;
    if (n > have) add('error', 'hardware_short', `hardware.${id}`, `The joints use ${n} of ${q(id)}, but the hardware list has only ${have}.`);
  }

  if (valid.length >= 2) {
    const adj = new Map<string, string[]>();
    for (const j of s.joints) {
      if (!parts.has(j.a) || !parts.has(j.b)) continue;
      adj.set(j.a, [...(adj.get(j.a) ?? []), j.b]);
      adj.set(j.b, [...(adj.get(j.b) ?? []), j.a]);
    }
    const seen = new Set([valid[0]!.id]);
    const queue = [valid[0]!.id];
    while (queue.length) {
      for (const n of adj.get(queue.shift()!) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    const loose = valid.filter((p) => !seen.has(p.id)).map((p) => p.id);
    if (loose.length) {
      add('error', 'not_connected', 'joints', `These parts are not joined to the rest of the piece: ${quoteAll(loose)}. Add joints for them.`, ...loose);
    }
  }

  if (s.steps.length === 0) {
    add('error', 'no_steps', 'steps', 'The spec has no assembly steps.');
    return issues;
  }
  const addedIn = new Map<string, number>();
  s.steps.forEach((st, i) => {
    const path = `steps[${i}]`;
    if (st.parts.length === 0 && st.hardware.length === 0) add('warning', 'empty_step', path, `Step ${i + 1} adds no parts or hardware.`);
    for (const id of st.parts) {
      if (!parts.has(id)) {
        add('error', 'step_unknown_part', `${path}.parts`, `Step ${i + 1} adds part ${q(id)}, which does not exist.`);
        continue;
      }
      const prev = addedIn.get(id);
      if (prev !== undefined) {
        add('error', 'step_part_twice', `${path}.parts`, `Part ${q(id)} is added in step ${prev + 1} and again in step ${i + 1}. Add each part once.`, id);
        continue;
      }
      addedIn.set(id, i);
    }
    for (const h of st.hardware) {
      if (!hw.has(h.id)) add('error', 'step_unknown_hardware', `${path}.hardware`, `Step ${i + 1} uses hardware ${q(h.id)}, which is not in the hardware list.`);
    }
  });
  const missing = valid.filter((p) => !addedIn.has(p.id)).map((p) => p.id);
  if (missing.length) add('error', 'step_missing_part', 'steps', `These parts are never added in any step: ${quoteAll(missing)}.`, ...missing);
  return issues;
}
