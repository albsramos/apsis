// A TypeScript copy of backend/internal/spec/fixings.go, for the standalone
// build. Keep the two in step: the same placement, the same holes.
import type { Fixing, Hardware, Hole, Part, Spec, Vec3 } from '@/api';

export const TOLERANCE = 0.5;
export const END_DISTANCE = 50;
export const BREAK_OUT_MARGIN = 3;

type Box = { min: [number, number, number]; max: [number, number, number] };
const AXIS_NAMES = ['x', 'y', 'z'] as const;

export const boxOf = (p: Part): Box => ({
  min: [p.position.x, p.position.y, p.position.z],
  max: [p.position.x + p.size.x, p.position.y + p.size.y, p.position.z + p.size.z],
});
export const extent = (b: Box, i: number) => b.max[i]! - b.min[i]!;
const mid = (b: Box, i: number) => (b.min[i]! + b.max[i]!) / 2;
export const thicknessAxis = (b: Box) => [1, 2].reduce((t, i) => (extent(b, i) < extent(b, t) ? i : t), 0);
const vec = (v: number[]): Vec3 => ({ x: v[0]!, y: v[1]!, z: v[2]! });

function overlap(a: Box, b: Box, i: number) {
  return Math.min(a.max[i]!, b.max[i]!) - Math.max(a.min[i]!, b.min[i]!);
}

function touching(a: Box, b: Box) {
  let meet = 0;
  for (let i = 0; i < 3; i++) {
    const o = overlap(a, b, i);
    if (o > TOLERANCE) continue;
    if (Math.abs(o) <= TOLERANCE) meet++;
    else return false;
  }
  return meet === 1;
}

function meeting(a: Box, b: Box): [number, number] | null {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.max[i]! - b.min[i]!) <= TOLERANCE) return [i, a.max[i]!];
    if (Math.abs(b.max[i]! - a.min[i]!) <= TOLERANCE) return [i, a.min[i]!];
  }
  return null;
}

export function spread(length: number, n: number): number[] {
  if (n <= 0) return [];
  // Whole millimetres: what you'd mark out with a tape.
  if (n === 1) return [Math.round(length / 2)];
  const end = Math.min(END_DISTANCE, length / (2 * n));
  return Array.from({ length: n }, (_, i) => Math.round(end + ((length - 2 * end) * i) / (n - 1)));
}

export const pilotHole = (d: number) => Math.max(1.5, Math.round(d * 0.6 * 2) / 2);
export const maxFaceHoleDepth = (t: number) => Math.floor((t * 2) / 3);

function dowelDepths(length: number, a: Box, b: Box, axis: number): [number, number] {
  if (length <= 0) return [0, 0];
  const half = length / 2 + 1;
  const aFace = thicknessAxis(a) === axis, bFace = thicknessAxis(b) === axis;
  if (aFace && !bFace) {
    const da = Math.min(half, maxFaceHoleDepth(extent(a, axis)));
    return [da, length - da + 2];
  }
  if (bFace && !aFace) {
    const db = Math.min(half, maxFaceHoleDepth(extent(b, axis)));
    return [length - db + 2, db];
  }
  return [half, half];
}

function pieceBox(s: Spec): Box {
  const boxes = s.parts.map(boxOf);
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]!))) as Box['min'],
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]!))) as Box['max'],
  };
}

const FASTENED = ['screw', 'brad_nail', 'dowel', 'pocket_screw', 'cam_lock'];

export function fixings(s: Spec): Fixing[] {
  const parts = new Map<string, Part>();
  for (const p of s.parts) if (!parts.has(p.id)) parts.set(p.id, p);
  const hw = new Map<string, Hardware>(s.hardware.map((h) => [h.id, h]));
  const piece = s.parts.length ? pieceBox(s) : null;
  const out: Fixing[] = [];
  s.joints.forEach((j, index) => {
    const a = parts.get(j.a), b = parts.get(j.b);
    if (!a || !b || j.a === j.b || !FASTENED.includes(j.method) || !piece) return;
    const ba = boxOf(a), bb = boxOf(b);
    if (!touching(ba, bb)) return;
    const m = meeting(ba, bb);
    if (!m) return;
    const [axis, plane] = m;
    const aThin = thicknessAxis(ba) === axis, bThin = thicknessAxis(bb) === axis;
    let throughA = aThin;
    if (aThin === bThin) throughA = Math.abs(mid(ba, axis) - mid(piece, axis)) < Math.abs(mid(bb, axis) - mid(piece, axis));
    const [through, into, bt, bi] = throughA ? [a, b, ba, bb] : [b, a, bb, ba];
    const dir = mid(bi, axis) < mid(bt, axis) ? -1 : 1;
    const outer = dir < 0 ? bt.max[axis]! : bt.min[axis]!;

    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const lo = (k: number) => Math.max(ba.min[k]!, bb.min[k]!);
    const hi = (k: number) => Math.min(ba.max[k]!, bb.max[k]!);
    const [along, across] = hi(v) - lo(v) > hi(u) - lo(u) ? [v, u] : [u, v];
    const n = Math.max(j.count || 0, 1);
    const offsets = spread(hi(along) - lo(along), n);
    const centre = (lo(across) + hi(across)) / 2;
    const point = (at: number, onAxis: number) => {
      const p = [0, 0, 0];
      p[axis] = onAxis;
      p[along] = lo(along) + at;
      p[across] = centre;
      return p;
    };
    const moved = (p: number[], to: number) => vec(p.map((x, i) => (i === axis ? to : x)));

    const f: Fixing = {
      joint: index,
      method: j.method,
      ...(j.hardware ? { hardware: j.hardware } : {}),
      through: through.id,
      into: into.id,
      axis: AXIS_NAMES[axis]!,
      direction: dir,
      endDistance: offsets[0] ?? 0,
      fasteners: [],
      holes: [],
    };
    const h = j.hardware ? hw.get(j.hardware) : undefined;
    const tT = extent(bt, axis);
    const hole = (part: string, kind: Hole['kind'], at: Vec3, direction: number, diameter: number, depth: number, through = false, countersink = false): Hole =>
      ({ part, kind, at, axis: AXIS_NAMES[axis]!, direction, diameter, depth, through, countersink });
    for (const off of offsets) {
      const entry = point(off, outer), face = point(off, plane);
      if (j.method === 'screw' || j.method === 'brad_nail') {
        const length = h?.length && h.length > 0 ? h.length : tT * 2;
        f.fasteners.push({ start: vec(entry), tip: moved(entry, outer + dir * length) });
        if (j.method === 'screw' && h?.diameter) {
          f.holes.push(
            hole(through.id, 'clearance', vec(entry), dir, h.diameter, tT, true, true),
            hole(into.id, 'pilot', vec(face), dir, pilotHole(h.diameter), Math.max(length - tT, 0)),
          );
        }
      } else if (j.method === 'dowel') {
        const [dt, di] = dowelDepths(h?.length ?? 0, bt, bi, axis);
        f.fasteners.push({ start: moved(face, plane - dir * dt), tip: moved(face, plane + dir * di) });
        if (h?.diameter) {
          f.holes.push(hole(through.id, 'dowel', vec(face), -dir, h.diameter, dt), hole(into.id, 'dowel', vec(face), dir, h.diameter, di));
        }
      } else {
        f.fasteners.push({ start: vec(entry), tip: vec(face) });
      }
    }
    out.push(f);
  });
  return out;
}

export function maxDowel(a: Box, b: Box, axis: number) {
  const room = (x: Box) => (thicknessAxis(x) === axis ? maxFaceHoleDepth(extent(x, axis)) : extent(x, axis) - BREAK_OUT_MARGIN);
  return Math.floor(room(a) + room(b) - 2);
}

export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): [number, Vec3] {
  const sub = (a: Vec3, b: Vec3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const lerp = (a: Vec3, b: Vec3, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    // two points
  } else if (a <= 1e-9) {
    t = clamp(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-9) s = clamp(-c / a);
    else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      if (den > 1e-9) s = clamp((b * f - c * e) / den);
      t = (b * s + f) / e;
      if (t < 0) [t, s] = [0, clamp(-c / a)];
      else if (t > 1) [t, s] = [1, clamp((b - c) / a)];
    }
  }
  const c1 = lerp(p1, q1, s), c2 = lerp(p2, q2, t);
  const diff = sub(c1, c2);
  return [Math.sqrt(dot(diff, diff)), c1];
}
