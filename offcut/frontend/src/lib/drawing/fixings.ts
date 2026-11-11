import type { Fixing, Hole, Joint, Spec } from '@/api';
import { subAssemblies } from './assemblies';

// The fixings come from the API (backend/internal/spec/fixings.go), already
// placed and checked. This file only selects and describes them.

/** The joints made in a step: both parts are in place once it's done, and one of them is new. */
export function stepJoints(spec: Spec, stepIndex: number): number[] {
  const step = spec.steps[stepIndex];
  if (!step) return [];
  const before = new Set(spec.steps.slice(0, stepIndex).flatMap((s) => s.parts));
  const now = new Set([...before, ...step.parts]);
  const uses = new Set(step.hardware.map((h) => h.id));
  const assembly = subAssemblies(spec);
  const out: number[] = [];
  spec.joints.forEach((j, i) => {
    if (!now.has(j.a) || !now.has(j.b)) return;
    // Runners are fitted in the step that uses them: the one that puts a
    // finished drawer into its case, which may add no parts at all.
    const made =
      j.method === 'runner'
        ? !!j.hardware && uses.has(j.hardware) && assembly.get(j.a) !== assembly.get(j.b)
        : step.parts.includes(j.a) || step.parts.includes(j.b);
    if (made) out.push(i);
  });
  return out;
}

export function stepFixings(spec: Spec, fixings: Fixing[], stepIndex: number): Fixing[] {
  const joints = new Set(stepJoints(spec, stepIndex));
  return fixings.filter((f) => joints.has(f.joint));
}

export interface FixingLine {
  through: string;
  into: string;
  /** How many joints this line covers. Identical joints are listed once. */
  times: number;
  text: string;
}

const mm = (n: number) => `${Number.isInteger(n) ? n : Number(n.toFixed(1))} mm`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function holeOf(f: Fixing, part: string, kind: Hole['kind']): Hole | undefined {
  return f.holes.find((h) => h.part === part && h.kind === kind);
}

function where(f: Fixing, n: number): string {
  const end = Math.round(f.endDistance);
  if (n === 1) return 'in the middle of the joint';
  return n === 2 ? `${end} mm from each end` : `${end} mm from each end and evenly between`;
}

/**
 * A step's fixings in words: what goes through which board, where, and what
 * to drill first. Joints that are the same apart from which side they're on
 * are one line.
 */
export function fixingLines(spec: Spec, fixings: Fixing[], stepIndex: number, letter: (id: string) => string): FixingLine[] {
  const hw = new Map(spec.hardware.map((h) => [h.id, h]));
  const byJoint = new Map(fixings.map((f) => [f.joint, f]));
  const lines = new Map<string, FixingLine>();
  for (const index of stepJoints(spec, stepIndex)) {
    const joint: Joint = spec.joints[index]!;
    const f = byJoint.get(index);
    const n = Math.max(joint.count || 0, 1);
    const h = joint.hardware ? hw.get(joint.hardware) : undefined;
    const size = h?.diameter && h.length ? ` (${h.diameter} × ${h.length} mm)` : h?.length ? ` (${h.length} mm)` : '';
    const [t, i] = f ? [letter(f.through), letter(f.into)] : [letter(joint.a), letter(joint.b)];
    let text: string;
    switch (joint.method) {
      case 'screw': {
        text = `${plural(n, 'screw', 'screws')}${size} through ${t} into ${i}, ${f ? where(f, n) : 'spaced evenly'}.`;
        const clear = f && holeOf(f, f.through, 'clearance');
        const pilot = f && holeOf(f, f.into, 'pilot');
        if (clear && pilot) {
          text += ` Drill ${mm(clear.diameter)} holes right through ${t} and countersink them, then ${mm(pilot.diameter)} pilot holes ${mm(pilot.depth)} deep into ${i}.`;
        }
        break;
      }
      case 'brad_nail':
        text = `Glue, then ${plural(n, 'nail', 'nails')}${size} through ${t} into ${i}, ${f ? where(f, n) : 'spaced evenly'}. No need to pre-drill.`;
        break;
      case 'dowel': {
        text = `${plural(n, 'dowel', 'dowels')}${size} between ${t} and ${i}, ${f ? where(f, n) : 'spaced evenly'}.`;
        const a = f && holeOf(f, f.through, 'dowel');
        const b = f && holeOf(f, f.into, 'dowel');
        if (a && b) {
          text += ` Drill ${mm(a.diameter)} holes ${mm(a.depth)} deep in ${t} and ${mm(b.depth)} deep in ${i}, in matching places. Glue the dowels in and press the parts together.`;
        }
        break;
      }
      case 'pocket_screw':
        text = `${plural(n, 'pocket screw', 'pocket screws')}${size}: drill the pocket holes with a jig in the hidden face of ${t}, ${f ? where(f, n) : 'spaced evenly'}, and screw into ${i}.`;
        break;
      case 'cam_lock':
        text = `${plural(n, 'cam lock', 'cam locks')}: the bolts screw into ${i}, the cams sit in holes in ${t}, ${f ? where(f, n) : 'spaced evenly'}. Follow the fittings' drilling template.`;
        break;
      case 'glue':
        text = `Glue ${t} to ${i} and clamp it until the glue sets.`;
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
