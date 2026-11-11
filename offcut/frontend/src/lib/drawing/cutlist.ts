import type { Spec } from '@/api';
import { labelParts, type PartGroup } from './labels';

export interface MaterialList {
  material: string;
  groups: PartGroup[];
  /** Total board area in square metres, before waste. */
  area: number;
}

export function cutList(spec: Spec): MaterialList[] {
  const { groups } = labelParts(spec);
  const byMaterial = new Map<string, MaterialList>();
  for (const g of groups) {
    let m = byMaterial.get(g.material);
    if (!m) {
      m = { material: g.material, groups: [], area: 0 };
      byMaterial.set(g.material, m);
    }
    m.groups.push(g);
    m.area += (g.length * g.width * g.quantity) / 1e6;
  }
  return [...byMaterial.values()].sort((a, b) => b.area - a.area);
}
