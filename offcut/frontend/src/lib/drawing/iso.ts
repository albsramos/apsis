import type { Part, Vec3 } from '@/api';
import { AXES, boxOf, center, type Box } from './geometry';

/**
 * Isometric line drawing of boards, seen from the front-left, above. The
 * viewer sees each box's front (z min), left (x min) and top (y max) faces.
 * Screen coordinates have y down.
 */
const COS30 = Math.cos(Math.PI / 6);

export function toScreen(p: Vec3): { x: number; y: number } {
  return { x: (p.x - p.z) * COS30, y: -p.y - (p.x + p.z) / 2 };
}

export type FaceName = 'top' | 'front' | 'left';

export interface IsoFace {
  partId: string;
  face: FaceName;
  points: { x: number; y: number }[];
}

export interface IsoItem {
  part: Part;
  offset?: Vec3;
}

export interface IsoScene {
  /** Back to front: draw in this order. */
  faces: IsoFace[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Where to put each part's callout: the middle of its front face. */
  anchors: Map<string, { x: number; y: number }>;
}

function faces(id: string, b: Box): IsoFace[] {
  const { min: a, max: c } = b;
  const pts = (vs: Vec3[]) => vs.map(toScreen);
  return [
    {
      partId: id,
      face: 'left',
      points: pts([
        { x: a.x, y: a.y, z: a.z },
        { x: a.x, y: a.y, z: c.z },
        { x: a.x, y: c.y, z: c.z },
        { x: a.x, y: c.y, z: a.z },
      ]),
    },
    {
      partId: id,
      face: 'front',
      points: pts([
        { x: a.x, y: a.y, z: a.z },
        { x: c.x, y: a.y, z: a.z },
        { x: c.x, y: c.y, z: a.z },
        { x: a.x, y: c.y, z: a.z },
      ]),
    },
    {
      partId: id,
      face: 'top',
      points: pts([
        { x: a.x, y: c.y, z: a.z },
        { x: c.x, y: c.y, z: a.z },
        { x: c.x, y: c.y, z: c.z },
        { x: a.x, y: c.y, z: c.z },
      ]),
    },
  ];
}

function screenBounds(b: Box) {
  const corners: Vec3[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push({ x, y, z });
  const s = corners.map(toScreen);
  return {
    minX: Math.min(...s.map((p) => p.x)),
    maxX: Math.max(...s.map((p) => p.x)),
    minY: Math.min(...s.map((p) => p.y)),
    maxY: Math.max(...s.map((p) => p.y)),
  };
}

const EPS = 0.01;

/**
 * Is a in front of b? For boxes that don't intersect there is an axis that
 * separates them, and along it the one nearer the viewer (smaller x, smaller
 * z, larger y) is in front.
 */
export function inFront(a: Box, b: Box): boolean | undefined {
  if (a.max.x <= b.min.x + EPS) return true;
  if (b.max.x <= a.min.x + EPS) return false;
  if (a.max.z <= b.min.z + EPS) return true;
  if (b.max.z <= a.min.z + EPS) return false;
  if (a.min.y >= b.max.y - EPS) return true;
  if (b.min.y >= a.max.y - EPS) return false;
  return undefined;
}

/** Back-to-front order: a topological sort on "is in front of", over pairs whose drawings overlap. */
export function paintOrder(boxes: Box[]): number[] {
  const n = boxes.length;
  const sb = boxes.map(screenBounds);
  const behind: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = sb[i]!;
      const b = sb[j]!;
      if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) continue;
      let front = inFront(boxes[i]!, boxes[j]!);
      if (front === undefined) {
        // Intersecting boxes (an invalid spec): fall back to the centres.
        const ci = center(boxes[i]!);
        const cj = center(boxes[j]!);
        front = ci.x + ci.z - ci.y < cj.x + cj.z - cj.y;
      }
      // j must be drawn before i if i is in front of j.
      if (front) behind[i]!.push(j);
      else behind[j]!.push(i);
    }
  }
  const order: number[] = [];
  const state = new Uint8Array(n); // 0 new, 1 visiting, 2 done
  const visit = (i: number) => {
    if (state[i] !== 0) return; // a cycle, or done: either way, move on
    state[i] = 1;
    for (const j of behind[i]!) visit(j);
    state[i] = 2;
    order.push(i);
  };
  for (let i = 0; i < n; i++) visit(i);
  return order;
}

export function isoScene(items: IsoItem[]): IsoScene {
  const boxes = items.map((it) => boxOf(it.part, it.offset));
  const order = paintOrder(boxes);
  const out: IsoFace[] = [];
  const anchors = new Map<string, { x: number; y: number }>();
  let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const i of order) {
    const b = boxes[i]!;
    const id = items[i]!.part.id;
    out.push(...faces(id, b));
    const sb = screenBounds(b);
    bounds = {
      minX: Math.min(bounds.minX, sb.minX),
      minY: Math.min(bounds.minY, sb.minY),
      maxX: Math.max(bounds.maxX, sb.maxX),
      maxY: Math.max(bounds.maxY, sb.maxY),
    };
    // Front face centre, unless the part is thin from the front (a side
    // panel): then the middle of its left face reads better.
    const c = center(b);
    const anchor =
      b.max.x - b.min.x < b.max.z - b.min.z
        ? { x: b.min.x, y: c.y, z: c.z }
        : { x: c.x, y: c.y, z: b.min.z };
    anchors.set(id, toScreen(anchor));
  }
  if (!Number.isFinite(bounds.minX)) bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { faces: out, bounds, anchors };
}

export function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scaleVec(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export function dominantAxis(v: Vec3): 'x' | 'y' | 'z' {
  return AXES.reduce((best, a) => (Math.abs(v[a]) > Math.abs(v[best]) ? a : best), 'x' as 'x' | 'y' | 'z');
}
