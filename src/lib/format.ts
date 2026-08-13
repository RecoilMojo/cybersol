export function formatHold(n: number) {
  return n.toLocaleString("en-US");
}

export function formatSol(n: number) {
  const s = n.toFixed(n >= 1 ? 2 : 3);
  return s.replace(/\.?0+$/, "") || "0";
}
