import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Spec } from '@/api';
import { board, boxOf, cutList, explodedItems, isoScene, labelParts, orthoView, paintOrder, stepScene } from '.';

// The same fixture the Go validator tests use.
const spec = JSON.parse(
  readFileSync(new URL('../../../../backend/internal/spec/examples/bedside_table.json', import.meta.url), 'utf8'),
) as Spec;

describe('labels', () => {
  it('gives identical boards one letter', () => {
    const { groups, byPart } = labelParts(spec);
    expect(groups).toHaveLength(8);
    expect(byPart.get('side_left')).toBe(byPart.get('side_right'));
    expect(byPart.get('side_left')?.quantity).toBe(2);
    expect(byPart.get('bottom')).toBe(byPart.get('shelf'));
    expect(groups.map((g) => g.letter).join('')).toBe('ABCDEFGH');
    // The drawer box front and back are the same board.
    expect(byPart.get('drawer_back')?.name).toBe('Drawer box front / Drawer box back');
  });

  it('reads a board as length × width × thickness', () => {
    const side = spec.parts.find((p) => p.id === 'side_left')!;
    expect(board(side)).toMatchObject({ length: 532, width: 394, thickness: 18 });
  });
});

describe('cut list', () => {
  it('groups boards by material, largest area first', () => {
    const list = cutList(spec);
    expect(list.map((m) => m.material)).toEqual(['18 mm plywood', '6 mm plywood', '12 mm plywood']);
    const total = list.reduce((n, m) => n + m.groups.reduce((k, g) => k + g.quantity, 0), 0);
    expect(total).toBe(spec.parts.length);
  });
});

describe('orthographic views', () => {
  it('sizes each view to the piece', () => {
    expect(orthoView(spec, 'front')).toMatchObject({ width: 450, height: 550 });
    expect(orthoView(spec, 'side')).toMatchObject({ width: 400, height: 550 });
    expect(orthoView(spec, 'top')).toMatchObject({ width: 450, height: 400 });
  });

  it('draws the back first in the front view, so the rest hides it', () => {
    expect(orthoView(spec, 'front').rects[0]?.partId).toBe('back');
  });

  it('draws the top last in the top view', () => {
    expect(orthoView(spec, 'top').rects.at(-1)?.partId).toBe('top');
  });
});

describe('isometric paint order', () => {
  const order = paintOrder(spec.parts.map((p) => boxOf(p))).map((i) => spec.parts[i]!.id);
  const at = (id: string) => order.indexOf(id);

  it('draws every part once', () => {
    expect(new Set(order).size).toBe(spec.parts.length);
  });

  it('draws the left side over the drawer inside it', () => {
    expect(at('side_left')).toBeGreaterThan(at('drawer_side_left'));
  });

  it('draws the top over the back below it', () => {
    expect(at('top')).toBeGreaterThan(at('back'));
  });

  it('draws the drawer front over the drawer box behind it', () => {
    expect(at('drawer_front')).toBeGreaterThan(at('drawer_front_inner'));
  });

  it('builds three faces per part', () => {
    expect(isoScene(explodedItems(spec)).faces).toHaveLength(spec.parts.length * 3);
  });
});

describe('step scenes', () => {
  it('shows only the parts assembled so far, plus the new ones', () => {
    const s = stepScene(spec, 2); // the top goes on
    expect(s.items.map((i) => i.part.id).sort()).toEqual(['bottom', 'shelf', 'side_left', 'side_right', 'top']);
    expect([...s.added]).toEqual(['top']);
  });

  it('lifts a new part away from where it goes, with an arrow back', () => {
    const s = stepScene(spec, 2);
    const top = s.items.find((i) => i.part.id === 'top')!;
    expect(top.offset!.y).toBeGreaterThan(0);
    expect(s.arrows).toHaveLength(1);
  });

  it('draws the first step in place', () => {
    const s = stepScene(spec, 0);
    expect(s.items.every((i) => !i.offset || (i.offset.x === 0 && i.offset.y === 0 && i.offset.z === 0))).toBe(true);
  });
});
