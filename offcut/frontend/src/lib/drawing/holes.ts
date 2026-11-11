import type { Fixing, Hole, Part, Spec } from '@/api';
import { AXES, boxOf, center, pieceBox, type Axis } from './geometry';
import type { PartGroup } from './labels';

// Holes on a part sheet. A board is drawn the way you'd mark it out: its face
// (length across, width down), plus an edge or end view wherever holes go in
// there. Every position is measured from a named edge of the board, so the
// same sheet works for a left and a right side.

/** Which end or edge of a board a side of it is, named for where it sits in the piece. */
const SIDE_NAMES: Record<Axis, [string, string]> = {
  x: ['left', 'right'],
  y: ['bottom', 'top'],
  z: ['front', 'back'],
};

export interface BoardAxes {
  length: Axis;
  width: Axis;
  thickness: Axis;
}

export function boardAxes(part: Part): BoardAxes {
  const [length, width, thickness] = [...AXES].sort((a, b) => part.size[b] - part.size[a]) as [Axis, Axis, Axis];
  return { length, width, thickness };
}

export type SheetViewName = 'face' | 'edge' | 'end';

export interface SheetHole {
  /** Across the view, from its left end, in mm. */
  u: number;
  /** Down the view, from its top edge, in mm. */
  v: number;
  diameter: number;
  depth: number;
  through: boolean;
  countersink: boolean;
  kind: Hole['kind'];
}

export interface SheetView {
  view: SheetViewName;
  /** "Outside face", "Front edge", "Bottom end": which surface you're looking at. */
  title: string;
  /** Size of the view: across and down, in mm. */
  width: number;
  height: number;
  /** What the view's four sides are, for measuring from. */
  left: string;
  right: string;
  top: string;
  bottom: string;
  holes: SheetHole[];
}

/** One drilling pattern: the parts of a group that are drilled the same. */
export interface DrillPattern {
  partIds: string[];
  views: SheetView[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Is this side of the part toward the outside of the piece? */
function outward(part: Part, axis: Axis, side: 0 | 1, piece: ReturnType<typeof pieceBox>): boolean {
  const b = boxOf(part);
  const mid = (piece.min[axis] + piece.max[axis]) / 2;
  return side === 1 ? center(b)[axis] >= mid : center(b)[axis] < mid;
}

function viewsOf(part: Part, holes: Hole[], piece: ReturnType<typeof pieceBox>): SheetView[] {
  const { length, width, thickness } = boardAxes(part);
  const b = boxOf(part);
  const name = (axis: Axis, side: 0 | 1) => SIDE_NAMES[axis][side];
  const views = new Map<string, SheetView>();
  for (const h of holes) {
    const axis = h.axis as Axis;
    // The surface the drill goes in through.
    const side: 0 | 1 = Math.abs(h.at[axis] - b.min[axis]) < 0.5 ? 0 : 1;
    let view: SheetViewName, across: Axis, down: Axis;
    if (axis === thickness) [view, across, down] = ['face', length, width];
    else if (axis === width) [view, across, down] = ['edge', length, thickness];
    else [view, across, down] = ['end', width, thickness];
    const title =
      view === 'face'
        ? `${outward(part, axis, side, piece) ? 'Outside' : 'Inside'} face`
        : `${name(axis, side)[0]!.toUpperCase()}${name(axis, side).slice(1)} ${view}`;
    const key = `${view}|${title}`;
    let v = views.get(key);
    if (!v) {
      v = {
        view,
        title,
        width: part.size[across],
        height: part.size[down],
        left: name(across, 0),
        right: name(across, 1),
        // Across the thickness, say inside or outside: a left and a right side are mirror images.
        top: down === thickness ? (outward(part, down, 0, piece) ? 'outside' : 'inside') : name(down, 0),
        bottom: down === thickness ? (outward(part, down, 1, piece) ? 'outside' : 'inside') : name(down, 1),
        holes: [],
      };
      views.set(key, v);
    }
    v.holes.push({
      u: round(h.at[across] - b.min[across]),
      v: round(h.at[down] - b.min[down]),
      diameter: h.diameter,
      depth: round(h.depth),
      through: h.through,
      countersink: h.countersink,
      kind: h.kind,
    });
  }
  const order: SheetViewName[] = ['face', 'edge', 'end'];
  return [...views.values()].sort((a, c) => order.indexOf(a.view) - order.indexOf(c.view) || a.title.localeCompare(c.title));
}

const signature = (views: SheetView[]) =>
  JSON.stringify(views.map((v) => [v.title, v.holes.map((h) => [h.u, h.v, h.diameter, h.depth, h.kind]).sort()]));

/**
 * How each board in a group is drilled. Boards cut the same can be drilled
 * differently (a bottom and a shelf); each different pattern gets its own
 * drawing. Mirrored boards (a left and a right side) drill the same.
 */
export function drillPatterns(spec: Spec, fixings: Fixing[], group: PartGroup): DrillPattern[] {
  const piece = pieceBox(spec);
  const byId = new Map(spec.parts.map((p) => [p.id, p]));
  const holes = fixings.flatMap((f) => f.holes);
  const patterns = new Map<string, DrillPattern>();
  for (const id of group.partIds) {
    const part = byId.get(id);
    if (!part) continue;
    const views = viewsOf(part, holes.filter((h) => h.part === id), piece);
    const key = signature(views);
    const p = patterns.get(key);
    if (p) p.partIds.push(id);
    else patterns.set(key, { partIds: [id], views });
  }
  return [...patterns.values()];
}

export interface HoleRow {
  count: number;
  text: string;
}

/** The drilling list for a pattern: one row per kind of hole, per surface. */
export function holeTable(pattern: DrillPattern): HoleRow[] {
  const rows = new Map<string, HoleRow>();
  for (const v of pattern.views) {
    for (const h of v.holes) {
      const what =
        h.kind === 'clearance'
          ? `⌀${h.diameter} right through${h.countersink ? ', countersunk' : ''}`
          : h.kind === 'pilot'
            ? `⌀${h.diameter} pilot, ${h.depth} deep`
            : `⌀${h.diameter} for a dowel, ${h.depth} deep`;
      const text = `${what}, in the ${v.title.toLowerCase()}`;
      const row = rows.get(text);
      if (row) row.count++;
      else rows.set(text, { count: 1, text });
    }
  }
  return [...rows.values()];
}
