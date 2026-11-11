import type { Spec } from '@/api';

/**
 * Sub-assemblies: parts joined by anything but runners belong together. A
 * drawer is one, the case another; runners only fit one into the other.
 */
export function subAssemblies(spec: Spec): Map<string, string> {
  const parent = new Map(spec.parts.map((p) => [p.id, p.id]));
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  for (const j of spec.joints) {
    if (j.method !== 'runner' && parent.has(j.a) && parent.has(j.b)) parent.set(find(j.a), find(j.b));
  }
  return new Map(spec.parts.map((p) => [p.id, find(p.id)]));
}
