/** Millimetres for people: whole numbers, or one decimal when it matters. */
export function mm(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function dims(l: number, w: number, t: number): string {
  return `${mm(l)} × ${mm(w)} × ${mm(t)}`;
}

export function area(m2: number): string {
  return `${m2.toFixed(2)} m²`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
