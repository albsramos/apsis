import type { Spec } from '@/api';
import { boxOf, pieceBox, type Box } from './geometry';

/**
 * Orthographic views in third-angle projection: the side view sits to the
 * right of the front view and the top view above it. Each view is a flat
 * drawing in millimetres with u to the right and v up.
 */
export type ViewName = 'front' | 'side' | 'top';

export interface ViewRect {
  partId: string;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface OrthoView {
  name: ViewName;
  /** Width and height of the view, in mm. */
  width: number;
  height: number;
  /** Far to near: draw in this order, filled, and nearer parts hide farther ones. */
  rects: ViewRect[];
}

const project: Record<ViewName, (b: Box) => [number, number, number, number]> = {
  // Looking at the front: x right, y up.
  front: (b) => [b.min.x, b.max.x, b.min.y, b.max.y],
  // Looking from the right: the front is on the left, so z runs right.
  side: (b) => [b.min.z, b.max.z, b.min.y, b.max.y],
  // Looking down: x right, the front at the bottom, so z runs up.
  top: (b) => [b.min.x, b.max.x, b.min.z, b.max.z],
};

/** How near a part is to the viewer: larger is nearer. */
const nearness: Record<ViewName, (b: Box) => number> = {
  front: (b) => -b.min.z,
  side: (b) => b.max.x,
  top: (b) => b.max.y,
};

export function orthoView(spec: Spec, name: ViewName): OrthoView {
  const piece = pieceBox(spec);
  const [pu0, pu1, pv0, pv1] = project[name](piece);
  const rects = spec.parts
    .map((p) => ({ p, b: boxOf(p) }))
    .sort((a, b) => nearness[name](a.b) - nearness[name](b.b))
    .map(({ p, b }) => {
      const [u0, u1, v0, v1] = project[name](b);
      return { partId: p.id, u0: u0 - pu0, u1: u1 - pu0, v0: v0 - pv0, v1: v1 - pv0 };
    });
  return { name, width: pu1 - pu0, height: pv1 - pv0, rects };
}
