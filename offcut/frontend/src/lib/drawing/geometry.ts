import type { Part, Spec, Vec3 } from '@/api';

export type Axis = 'x' | 'y' | 'z';
export const AXES: Axis[] = ['x', 'y', 'z'];

export interface Box {
  min: Vec3;
  max: Vec3;
}

export function boxOf(part: Pick<Part, 'position' | 'size'>, offset: Vec3 = { x: 0, y: 0, z: 0 }): Box {
  const min = { x: part.position.x + offset.x, y: part.position.y + offset.y, z: part.position.z + offset.z };
  return { min, max: { x: min.x + part.size.x, y: min.y + part.size.y, z: min.z + part.size.z } };
}

export function center(b: Box): Vec3 {
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
}

export function union(boxes: Box[]): Box {
  if (boxes.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const u: Box = { min: { ...boxes[0]!.min }, max: { ...boxes[0]!.max } };
  for (const b of boxes) {
    for (const a of AXES) {
      u.min[a] = Math.min(u.min[a], b.min[a]);
      u.max[a] = Math.max(u.max[a], b.max[a]);
    }
  }
  return u;
}

export interface Board {
  length: number;
  width: number;
  thickness: number;
  /** Which axis each board dimension lies along. */
  axes: { length: Axis; width: Axis; thickness: Axis };
}

/** A part's board dimensions: its extents from largest to smallest. */
export function board(part: Pick<Part, 'size'>): Board {
  const sorted = [...AXES].sort((a, b) => part.size[b] - part.size[a]);
  const [l, w, t] = sorted as [Axis, Axis, Axis];
  return {
    length: part.size[l],
    width: part.size[w],
    thickness: part.size[t],
    axes: { length: l, width: w, thickness: t },
  };
}

export function pieceBox(spec: Spec): Box {
  return union(spec.parts.map((p) => boxOf(p)));
}
