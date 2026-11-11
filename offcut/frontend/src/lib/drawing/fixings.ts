import type { Hardware, Joint, Part, Spec, Vec3 } from '@/api';
import { AXES, boxOf, center, pieceBox, type Axis, type Box } from './geometry';
import { subAssemblies } from './assemblies';

const TOLERANCE = 0.5;
/** How far the first and last fixing sit from the ends of a joint. */
export const END_DISTANCE = 50;

/**
 * Where a joint's fixings go, worked out from the boards: through the board
 * whose face meets the other's edge, spread along the joint line. Screws and
 * nails go from `through` into `into`; dowels sit half in each.
 */
export interface Fixing {
  joint: Joint;
  through: Part;
  into: Part;
  /** The axis the fixings are driven along. */
  axis: Axis;
  /** +1 if they are driven toward larger coordinates on that axis. */
  direction: 1 | -1;
  /** Where each one enters `through`, on its outer face. */
  entries: Vec3[];
  /** Where each one crosses into `into`: on the face the boards share. */
  holes: Vec3[];
  /** How far the first and last sit from the ends of the joint, in mm. */
  end: number;
}

const thicknessAxis = (b: Box): Axis =>
  AXES.reduce((t, a) => (b.max[a] - b.min[a] < b.max[t] - b.min[t] ? a : t), 'x' as Axis);

function meeting(a: Box, b: Box): { axis: Axis; plane: number } | null {
  for (const axis of AXES) {
    if (Math.abs(a.max[axis] - b.min[axis]) <= TOLERANCE) return { axis, plane: a.max[axis] };
    if (Math.abs(b.max[axis] - a.min[axis]) <= TOLERANCE) return { axis, plane: a.min[axis] };
  }
  return null;
}

/** Positions along a joint `length` long: 50 mm from each end, the rest evenly between. */
export function spread(length: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [length / 2];
  const end = Math.min(END_DISTANCE, length / (2 * n));
  return Array.from({ length: n }, (_, i) => end + ((length - 2 * end) * i) / (n - 1));
}

export function fixingOf(spec: Spec, joint: Joint): Fixing | null {
  const byId = new Map(spec.parts.map((p) => [p.id, p]));
  const a = byId.get(joint.a), b = byId.get(joint.b);
  if (!a || !b || joint.method === 'runner') return null;
  const ba = boxOf(a), bb = boxOf(b);
  const m = meeting(ba, bb);
  if (!m) return null;

  // Through the board that is thin in the direction of the joint. If both are
  // (a drawer front on a drawer box), through the one further inside, so the
  // heads don't show.
  const aThin = thicknessAxis(ba) === m.axis, bThin = thicknessAxis(bb) === m.axis;
  let throughA: boolean;
  if (aThin !== bThin) throughA = aThin;
  else {
    const mid = center(pieceBox(spec))[m.axis];
    throughA = Math.abs(center(ba)[m.axis] - mid) < Math.abs(center(bb)[m.axis] - mid);
  }
  const [through, into, bt] = throughA ? [a, b, ba] : [b, a, bb];
  const direction: 1 | -1 = center(boxOf(into))[m.axis] > center(bt)[m.axis] ? 1 : -1;
  const outer = direction === 1 ? bt.min[m.axis] : bt.max[m.axis];

  // Spread along the longer side of the shared face, centred on the shorter.
  const [u, v] = AXES.filter((x) => x !== m.axis) as [Axis, Axis];
  const lo = (x: Axis) => Math.max(ba.min[x], bb.min[x]);
  const hi = (x: Axis) => Math.min(ba.max[x], bb.max[x]);
  const [along, across] = hi(u) - lo(u) >= hi(v) - lo(v) ? [u, v] : [v, u];
  const n = Math.max(joint.count || 0, 1);
  const offsets = spread(hi(along) - lo(along), n);
  const at = offsets.map((d) => lo(along) + d);
  const mid = (lo(across) + hi(across)) / 2;
  const point = (alongAt: number, axisAt: number) =>
    ({ [m.axis]: axisAt, [along]: alongAt, [across]: mid }) as unknown as Vec3;
  return {
    joint,
    through,
    into,
    axis: m.axis,
    direction,
    entries: at.map((p) => point(p, outer)),
    holes: at.map((p) => point(p, m.plane)),
    end: offsets[0] ?? 0,
  };
}

/** The joints made in a step: both parts are in place once it's done, and one of them is new. */
export function stepJoints(spec: Spec, stepIndex: number): Joint[] {
  const before = new Set(spec.steps.slice(0, stepIndex).flatMap((s) => s.parts));
  const step = spec.steps[stepIndex];
  if (!step) return [];
  const now = new Set([...before, ...step.parts]);
  const uses = new Set(step.hardware.map((h) => h.id));
  const assembly = subAssemblies(spec);
  return spec.joints.filter((j) => {
    if (!now.has(j.a) || !now.has(j.b)) return false;
    // Runners are fitted in the step that uses them: the one that puts a
    // finished drawer into its case, which may add no parts at all.
    if (j.method === 'runner') return !!j.hardware && uses.has(j.hardware) && assembly.get(j.a) !== assembly.get(j.b);
    return step.parts.includes(j.a) || step.parts.includes(j.b);
  });
}

export const stepFixings = (spec: Spec, stepIndex: number): Fixing[] =>
  stepJoints(spec, stepIndex)
    .map((j) => fixingOf(spec, j))
    .filter((f): f is Fixing => !!f);

/** Diameter and length from a hardware name such as "Wood screw, 4 × 40 mm". */
export function fastenerSize(h: Hardware | undefined): { diameter?: number; length?: number } {
  if (!h) return {};
  const pair = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm/i.exec(h.name);
  if (pair) return { diameter: Number(pair[1]), length: Number(pair[2]) };
  const single = /(\d+(?:\.\d+)?)\s*mm/i.exec(h.name);
  return single ? { length: Number(single[1]) } : {};
}

/** A pilot hole for a wood screw: about 60% of its diameter, to the nearest half millimetre. */
export const pilotHole = (diameter: number) => Math.max(1.5, Math.round(diameter * 0.6 * 2) / 2);

export interface FixingLine {
  /** Letters, for the parts list: "B" through, "C" into. */
  through: string;
  into: string;
  /** How many joints this line covers. Identical joints are listed once. */
  times: number;
  text: string;
}

const mmText = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} mm`;

/**
 * The step's fixings in words: which board to fix through, what to drill and
 * where. Joints that are the same apart from which side they're on are one
 * line.
 */
export function fixingLines(spec: Spec, stepIndex: number, letter: (id: string) => string): FixingLine[] {
  const hw = new Map(spec.hardware.map((h) => [h.id, h]));
  const lines = new Map<string, FixingLine>();
  for (const joint of stepJoints(spec, stepIndex)) {
    const f = fixingOf(spec, joint);
    const n = Math.max(joint.count || 0, 1);
    const h = joint.hardware ? hw.get(joint.hardware) : undefined;
    const { diameter, length } = fastenerSize(h);
    const size = diameter && length ? ` (${diameter} × ${length} mm)` : length ? ` (${length} mm)` : '';
    const count = (one: string, many: string) => `${n} ${n === 1 ? one : many}${size}`;
    const [t, i] = f ? [letter(f.through.id), letter(f.into.id)] : [letter(joint.a), letter(joint.b)];
    const fromEnds = f ? Math.round(f.end) : END_DISTANCE;
    const where = n === 1 ? 'in the middle of the joint' : n === 2 ? `${fromEnds} mm from each end` : `${fromEnds} mm from each end and evenly between`;
    let text: string;
    switch (joint.method) {
      case 'screw':
        text = `${count('screw', 'screws')} through ${t} into ${i}, ${where}.`;
        if (diameter) {
          text += ` Drill ${mmText(diameter)} holes through ${t} and countersink them, then ${mmText(pilotHole(diameter))} pilot holes into ${i}.`;
        }
        break;
      case 'pocket_screw':
        text = `${count('pocket screw', 'pocket screws')}: drill the pocket holes in the hidden face of ${t}, ${where}, and screw into ${i}.`;
        break;
      case 'dowel': {
        const depth = length ? ` ${mmText(length / 2 + 1)} deep` : '';
        text = `${count('dowel', 'dowels')} between ${t} and ${i}, ${where}. Drill matching ${diameter ? `${mmText(diameter)} ` : ''}holes${depth} in both, glue them in, and press the parts together.`;
        break;
      }
      case 'brad_nail':
        text = `Glue, then ${count('nail', 'nails')} through ${t} into ${i}, ${where}.`;
        break;
      case 'glue':
        text = `Glue ${t} to ${i} and clamp it until the glue sets.`;
        break;
      case 'cam_lock':
        text = `${count('cam lock', 'cam locks')}: the bolts screw into ${i}, the cams sit in holes in ${t}, ${where}.`;
        break;
      case 'groove':
        text = `Slide ${t} into the groove in ${i}, with glue.`;
        break;
      case 'runner':
        text = `Screw the case half of the runner to ${letter(joint.b)} and the drawer half to ${letter(joint.a)}, as the runner's own instructions show.`;
        break;
      default:
        text = `Join ${t} to ${i}.`;
    }
    if (joint.notes) text += ` ${joint.notes}`;
    const key = `${t}|${i}|${text}`;
    const line = lines.get(key);
    if (line) line.times++;
    else lines.set(key, { through: t, into: i, times: 1, text });
  }
  return [...lines.values()];
}
