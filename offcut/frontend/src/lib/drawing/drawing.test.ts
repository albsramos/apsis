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

  it('explodes a new sub-assembly around its own parts', () => {
    const s = stepScene(spec, 0); // sides and bottom
    const offset = (id: string) => s.items.find((i) => i.part.id === id)!.offset!;
    expect(offset('side_left').x).toBeLessThan(0);
    expect(offset('side_right').x).toBeGreaterThan(0);
    expect(s.arrows).toHaveLength(3);
  });

  it('builds the drawer on its own, not inside the case', () => {
    const s = stepScene(spec, 4);
    const ids = s.items.map((i) => i.part.id);
    expect(ids.sort()).toEqual(['drawer_back', 'drawer_bottom', 'drawer_front_inner', 'drawer_side_left', 'drawer_side_right']);
    const offset = (id: string) => s.items.find((i) => i.part.id === id)!.offset!;
    expect(offset('drawer_bottom').y).toBeLessThan(0);
    expect(offset('drawer_front_inner').z).toBeLessThan(0);
    expect(offset('drawer_back').z).toBeGreaterThan(0);
  });

  it('slides the finished drawer into the case on its runners', () => {
    const s = stepScene(spec, 5);
    expect(s.items).toHaveLength(11);
    expect([...s.moved].sort()).toEqual(['drawer_back', 'drawer_bottom', 'drawer_front_inner', 'drawer_side_left', 'drawer_side_right']);
    expect(s.items.find((i) => i.part.id === 'drawer_back')!.offset!.z).toBeLessThan(0);
    expect(s.items.find((i) => i.part.id === 'side_left')!.offset).toBeUndefined();
    expect(s.arrows).toHaveLength(1);
  });

  it('pulls a part back from what it is fastened to', () => {
    const s = stepScene(spec, 6); // the drawer front goes on the drawer box
    expect(s.items.find((i) => i.part.id === 'drawer_front')!.offset!.z).toBeLessThan(0);
  });
});
