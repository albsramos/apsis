import type { Part, Spec } from '@/api';
import { board } from './geometry';

/** Identical boards share a letter, like a flat-pack manual: "B ×2". */
export interface PartGroup {
  letter: string;
  name: string;
  material: string;
  length: number;
  width: number;
  thickness: number;
  quantity: number;
  partIds: string[];
}

function letterFor(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const round = (v: number) => Math.round(v * 10) / 10;

function groupKey(p: Part): string {
  const b = board(p);
  return [round(b.length), round(b.width), round(b.thickness), p.material.trim().toLowerCase()].join('|');
}

export interface Labels {
  groups: PartGroup[];
  /** part id → its group */
  byPart: Map<string, PartGroup>;
}

export function labelParts(spec: Spec): Labels {
  const groups: PartGroup[] = [];
  const byKey = new Map<string, PartGroup>();
  const byPart = new Map<string, PartGroup>();
  for (const p of spec.parts) {
    const key = groupKey(p);
    let g = byKey.get(key);
    if (!g) {
      const b = board(p);
      g = {
        letter: letterFor(groups.length),
        name: p.name,
        material: p.material,
        length: b.length,
        width: b.width,
        thickness: b.thickness,
        quantity: 0,
        partIds: [],
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.quantity++;
    g.partIds.push(p.id);
    if (!g.name.split(' / ').includes(p.name)) g.name = `${g.name} / ${p.name}`;
    byPart.set(p.id, g);
  }
  return { groups, byPart };
}
