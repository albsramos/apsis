import type { Spec, Step, Vec3 } from '@/api';
import { boxOf, center, pieceBox, union, type Axis, type Box } from './geometry';
import { dominantAxis, ZERO, type IsoItem } from './iso';

/** Every part pushed out from the piece's centre: the exploded view. */
export function explodedItems(spec: Spec, factor = 0.6): IsoItem[] {
  const c = center(pieceBox(spec));
  return spec.parts.map((part) => {
    const pc = center(boxOf(part));
    return { part, offset: { x: (pc.x - c.x) * factor, y: (pc.y - c.y) * factor, z: (pc.z - c.z) * factor } };
  });
}

export interface StepScene {
  items: IsoItem[];
  /** Parts this step adds: drawn highlighted, lifted off where they go. */
  added: Set<string>;
  /** A finished sub-assembly this step fits in place, such as a drawer going in on its runners. */
  moved: Set<string>;
  /** Arrows from where an added part is drawn to where it goes. */
  arrows: { partId: string; from: Vec3; to: Vec3 }[];
}

/**
 * Sub-assemblies: parts joined by anything but runners belong together. A
 * drawer is one, the case another; runners only fit one into the other.
 */
export function subAssemblies(spec: Spec): Map<string, string> {
  const parent = new Map(spec.parts.map((p) => [p.id, p.id]));
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  for (const j of spec.joints) {
    if (j.method !== 'runner' && parent.has(j.a) && parent.has(j.b)) parent.set(find(j.a), find(j.b));
  }
  return new Map(spec.parts.map((p) => [p.id, find(p.id)]));
}

/**
 * What a step's drawing shows. A step that builds a sub-assembly shows only
 * that sub-assembly, so a drawer is drawn on its own, not floating around the
 * case it goes into later. New parts are pulled back along the way they go
 * on. A step that fits a finished sub-assembly in (a drawer on its runners)
 * shows it pulled out of the case, with an arrow.
 */
export function stepScene(spec: Spec, stepIndex: number): StepScene {
  const steps: Step[] = spec.steps;
  const step = steps[stepIndex];
  const added = new Set(step?.parts ?? []);
  const byId = new Map(spec.parts.map((p) => [p.id, p]));
  const assembly = subAssemblies(spec);
  const piece = pieceBox(spec);
  const lift = Math.max(piece.max.x - piece.min.x, piece.max.y - piece.min.y, piece.max.z - piece.min.z) * 0.22;

  // Which sub-assemblies have been put together so far, step by step: runners
  // join two, and a step that adds parts of several joins those.
  const group = new Map<string, string>();
  const groupOf = (a: string): string => {
    const up = group.get(a) ?? a;
    if (up === a) return a;
    const root = groupOf(up);
    group.set(a, root);
    return root;
  };
  const firstPlaced = new Map<string, number>(); // sub-assembly -> first step it appears in
  const placed = new Set<string>();
  let joins: [string, string][] = [];
  for (let i = 0; i <= stepIndex && i < steps.length; i++) {
    const st = steps[i]!;
    const uses = new Set(st.hardware.map((h) => h.id));
    const here: [string, string][] = [];
    for (const j of spec.joints) {
      const a = assembly.get(j.a), b = assembly.get(j.b);
      if (j.method === 'runner' && j.hardware && uses.has(j.hardware) && a && b && a !== b) here.push([a, b]);
    }
    const comps = [...new Set(st.parts.map((id) => assembly.get(id)).filter((a): a is string => !!a))];
    for (let k = 1; k < comps.length; k++) here.push([comps[0]!, comps[k]!]);
    for (const [a, b] of here) group.set(groupOf(a), groupOf(b));
    for (const id of st.parts) {
      const a = assembly.get(id);
      if (a && !firstPlaced.has(a)) firstPlaced.set(a, i);
    }
    if (i < stepIndex) st.parts.forEach((id) => placed.add(id));
    else joins = here;
  }

  // Fitting a finished sub-assembly: the one started later moves into the other.
  const movedAssemblies = new Set<string>();
  for (const [a, b] of joins) {
    const later = (firstPlaced.get(a) ?? Infinity) > (firstPlaced.get(b) ?? Infinity) ? a : b;
    if (spec.parts.some((p) => placed.has(p.id) && assembly.get(p.id) === later)) movedAssemblies.add(later);
  }

  const relevant = new Set([...added, ...joins.flat()].map((id) => groupOf(assembly.get(id) ?? id)));
  const shown = spec.parts.filter((p) => placed.has(p.id) && (relevant.size === 0 || relevant.has(groupOf(assembly.get(p.id)!))));
  const moved = new Set(shown.filter((p) => movedAssemblies.has(assembly.get(p.id)!)).map((p) => p.id));
  const still = shown.filter((p) => !moved.has(p.id));

  const items: IsoItem[] = [];
  const arrows: StepScene['arrows'] = [];
  for (const part of still) items.push({ part });

  if (moved.size) {
    // Slid in from the front, the way a drawer goes in.
    const box = union([...moved].map((id) => boxOf(byId.get(id)!)));
    const offset: Vec3 = { ...ZERO, z: -(box.max.z - box.min.z) * 0.7 };
    for (const id of moved) items.push({ part: byId.get(id)!, offset });
    const to = center(box);
    arrows.push({ partId: [...moved][0]!, from: { x: to.x, y: to.y, z: to.z + offset.z }, to });
  }

  // Each new part pulls back from the parts it is fastened to, so a drawer
  // front comes off the front and a bottom drops out underneath. A part with
  // nothing to fasten to here moves out from the middle of the rest.
  const newParts = [...added].map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const inScene = new Set([...still, ...newParts].map((p) => p.id));
  const base = still.length ? still : newParts.length > 1 ? newParts : [];
  for (const part of newParts) {
    const neighbours = spec.joints
      .filter((j) => j.method !== 'runner' && (j.a === part.id || j.b === part.id))
      .map((j) => (j.a === part.id ? j.b : j.a))
      .filter((id) => id !== part.id && inScene.has(id))
      .map((id) => byId.get(id)!);
    const pc = center(boxOf(part));
    // Out through the faces it meets: a side leaves its bottom sideways. Faces
    // on opposite sides (a shelf between two sides) cancel out, and then it
    // moves away from the middle of what it joins.
    const push = { x: 0, y: 0, z: 0 };
    for (const n of neighbours) {
      const axis = meetingAxis(boxOf(part), boxOf(n));
      if (axis) push[axis] += Math.sign(pc[axis] - center(boxOf(n))[axis]);
    }
    const from = neighbours.length ? neighbours : base.filter((p) => p.id !== part.id);
    const anchor = from.length ? center(union(from.map((p) => boxOf(p)))) : null;
    let offset: Vec3 = ZERO;
    if (anchor) {
      const d = push.x || push.y || push.z ? push : { x: pc.x - anchor.x, y: pc.y - anchor.y, z: pc.z - anchor.z };
      const axis = dominantAxis(d);
      const sign = Math.sign(d[axis]) || 1;
      offset = { ...ZERO, [axis]: sign * lift };
      arrows.push({ partId: part.id, from: { x: pc.x + offset.x, y: pc.y + offset.y, z: pc.z + offset.z }, to: pc });
    }
    items.push({ part, offset });
  }
  return { items, added, moved, arrows };
}

/** The axis two boxes meet across, face to face, if they do. */
function meetingAxis(a: Box, b: Box): Axis | null {
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(a.max[axis] - b.min[axis]) <= 0.5 || Math.abs(b.max[axis] - a.min[axis]) <= 0.5) return axis;
  }
  return null;
}
