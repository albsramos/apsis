import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Spec } from '@/api';
import { fixings, pilotHole, spread } from './fixings';
import { validate } from './validate';

// The same fixture, and the same expectations, as the Go tests: this is a copy
// of backend/internal/spec/fixings.go and must place fixings the same way.
const spec = JSON.parse(
  readFileSync(new URL('../../../backend/internal/spec/examples/bedside_table.json', import.meta.url), 'utf8'),
) as Spec;
const byJoint = (a: string, b: string) => fixings(spec).find((f) => spec.joints[f.joint]!.a === a && spec.joints[f.joint]!.b === b)!;

describe('fixings', () => {
  it('screws through the side into the edge of the bottom, 50 mm from each end', () => {
    const f = byJoint('side_left', 'bottom');
    expect(f.through).toBe('side_left');
    expect(f.axis).toBe('x');
    expect(f.fasteners.map((x) => x.start.z)).toEqual([50, 197, 344]);
    const pilot = f.holes.find((h) => h.kind === 'pilot')!;
    expect([pilot.diameter, pilot.depth, pilot.at.x, pilot.at.y]).toEqual([2.5, 22, 18, 9]);
  });

  it('screws a drawer front on from inside the box', () => {
    expect(byJoint('drawer_front', 'drawer_front_inner').through).toBe('drawer_front_inner');
  });

  it('puts a dowel no more than two thirds into the face of the top', () => {
    const [top, side] = byJoint('top', 'side_left').holes;
    expect([top!.part, top!.depth, side!.depth]).toEqual(['top', 12, 30]);
  });

  it('spaces fixings from the ends, or centres a single one', () => {
    expect(spread(394, 2)).toEqual([50, 344]);
    expect(spread(100, 1)).toEqual([50]);
    expect(pilotHole(4)).toBe(2.5);
  });
});

describe('fixing checks', () => {
  const broken = (change: (s: Spec) => void) => {
    const s = structuredClone(spec);
    change(s);
    return validate(s).filter((i) => i.severity === 'error').map((i) => i.code);
  };

  it('passes the example', () => {
    expect(validate(spec)).toEqual([]);
  });

  it('catches drawer-front screws that would come out the front', () => {
    expect(broken((s) => (s.hardware.find((h) => h.id === 'screw_3x25')!.length = 35))).toContain('fixing_breaks_out');
  });

  it('catches screws that hit the nails holding the drawer box', () => {
    expect(
      broken((s) => {
        s.joints.find((j) => j.a === 'drawer_front')!.count = 9;
        s.hardware.find((h) => h.id === 'screw_3x25')!.quantity = 9;
      }),
    ).toContain('fixings_clash');
  });

  it('catches a thick screw into a thin edge', () => {
    expect(broken((s) => (s.hardware.find((h) => h.id === 'screw_4x40')!.diameter = 8))).toContain('fixing_edge_thin');
  });
});
