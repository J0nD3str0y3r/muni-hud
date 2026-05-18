// Official colors for BART, Muni Metro, and streetcar lines.
// Falls back to a hash-based palette for unlisted bus routes.

const OFFICIAL: Record<string, string> = {
  // ── BART ──────────────────────────────────────────────────────────
  // BART 511 line IDs are destination-based, not color-based.
  // Mapping by known terminus codes to the operating line color.
  ANTC: "#FFD700", // Yellow Line  (Antioch)
  BERY: "#F97316", // Orange Line  (Berryessa)
  DALY: "#22C55E", // Green Line   (Daly City)
  DUBL: "#3B82F6", // Blue Line    (Dublin/Pleasanton)
  MLBR: "#EF4444", // Red Line     (Millbrae)
  NCON: "#F97316", // Orange Line  (N Concord)
  RICH: "#EF4444", // Red Line     (Richmond)
  SFIA: "#FFD700", // Yellow Line  (SFO)
  WARM: "#22C55E", // Green Line   (Warm Springs)

  // ── Muni Metro (light rail) ────────────────────────────────────────
  J: "#FBB919",   // J Church     — gold
  K: "#4A90D9",   // K Ingleside  — blue
  L: "#F97316",   // L Taraval    — orange
  M: "#5B8C4A",   // M Ocean View — green
  N: "#1D4ED8",   // N Judah      — dark blue
  T: "#DC2626",   // T Third      — red

  // ── Historic streetcar ─────────────────────────────────────────────
  F: "#D4A017",   // F Market & Wharves — amber/historic
  E: "#D4A017",   // E Embarcadero      — amber/historic
};

const FALLBACK = [
  "#f97316", // orange
  "#a78bfa", // purple
  "#34d399", // green
  "#fb7185", // pink
  "#fbbf24", // yellow
  "#38bdf8", // sky
  "#f472b6", // rose
  "#4ade80", // lime
];

const cache = new Map<string, string>();

export function lineColor(line: string): string {
  const key = line.toUpperCase().trim();
  if (OFFICIAL[key]) return OFFICIAL[key];
  if (!cache.has(key)) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xff;
    cache.set(key, FALLBACK[hash % FALLBACK.length]);
  }
  return cache.get(key)!;
}

// True for dark badge backgrounds that need white text instead of black
export function lineTextColor(line: string): string {
  const bg = lineColor(line);
  // Dark backgrounds: dark blue, dark green, red
  const dark = ["#1D4ED8", "#5B8C4A", "#DC2626", "#EF4444"];
  return dark.includes(bg) ? "#ffffff" : "#000000";
}
