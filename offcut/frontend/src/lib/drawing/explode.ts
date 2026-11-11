import type { Spec, Step, Vec3 } from '@/api';
import { boxOf, center, pieceBox, union } from './geometry';
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
  /** Arrows from where an added part is drawn to where it goes. */
  arrows: { partId: string; from: Vec3; to: Vec3 }[];
}

/**
 * What a step's drawing shows: the parts already assembled, and the parts this
 * step adds, pulled back along the way they go on so you can see where.
 */
export function stepScene(spec: Spec, stepIndex: number): StepScene {
  const steps: Step[] = spec.steps;
  const before = new Set(steps.slice(0, stepIndex).flatMap((s) => s.parts));
  const added = new Set(steps[stepIndex]?.parts ?? []);
  const byId = new Map(spec.parts.map((p) => [p.id, p]));
  const placed = spec.parts.filter((p) => before.has(p.id));
  const piece = pieceBox(spec);
  const lift = Math.max(piece.max.x - piece.min.x, piece.max.y - piece.min.y, piece.max.z - piece.min.z) * 0.22;

  const items: IsoItem[] = placed.map((part) => ({ part }));
  const arrows: StepScene['arrows'] = [];
  const anchor = placed.length ? center(union(placed.map((p) => boxOf(p)))) : null;

  for (const id of added) {
    const part = byId.get(id);
    if (!part) continue;
    let offset: Vec3 = ZERO;
    if (anchor) {
      const pc = center(boxOf(part));
      const d = { x: pc.x - anchor.x, y: pc.y - anchor.y, z: pc.z - anchor.z };
      const axis = dominantAxis(d);
      // Toward the viewer is easier to read than away: pull parts that go on
      // the back or the right side out the way they go, but lift everything
      // else up or out to the front-left.
      const sign = Math.sign(d[axis]) || 1;
      offset = { ...ZERO, [axis]: sign * lift };
      const to = center(boxOf(part));
      arrows.push({ partId: id, from: { x: to.x + offset.x, y: to.y + offset.y, z: to.z + offset.z }, to });
    }
    items.push({ part, offset });
  }
  return { items, added, arrows };
}
