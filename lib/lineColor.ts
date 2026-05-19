// BART lines own red, orange, yellow, green, blue exclusively.
// All other lines (Muni Metro, bus, streetcar) use the non-BART palette.

// ── BART official colors (bart.gov) ────────────────────────────────────────
// 511 BART line IDs are terminus-based, mapped to the operating line color.
const BART: Record<string, string> = {
  ANTC: "#FFD200", // Yellow  (Antioch)
  SFIA: "#FFD200", // Yellow  (SFO/Millbrae)
  BERY: "#FF9000", // Orange  (Berryessa)
  NCON: "#FF9000", // Orange  (N Concord)
  DALY: "#00AD6F", // Green   (Daly City)
  WARM: "#00AD6F", // Green   (Warm Springs)
  DUBL: "#009AC7", // Blue    (Dublin/Pleasanton)
  MLBR: "#ED1C24", // Red     (Millbrae)
  RICH: "#ED1C24", // Red     (Richmond)
};

// 511 StopMonitoring returns color-based IDs like "Yellow-N", "Red-S", "BLUE", etc.
const BART_COLOR: Record<string, string> = {
  YELLOW: "#FFD200",
  ORANGE: "#FF9000",
  GREEN:  "#00AD6F",
  BLUE:   "#009AC7",
  RED:    "#ED1C24",
};

// ── Non-BART lines: purples, pinks, teals, indigos, cyans, browns ──────────
// None of these are red / orange / yellow / green / blue.
const OTHER: Record<string, string> = {
  // Muni Metro (light rail)
  J: "#9333EA", // purple   — J Church
  K: "#0891B2", // cyan     — K Ingleside
  L: "#DB2777", // pink     — L Taraval
  M: "#0F766E", // teal     — M Ocean View
  N: "#4338CA", // indigo   — N Judah
  T: "#BE185D", // rose     — T Third

  // Historic streetcar
  F: "#B45309", // amber-brown — F Market & Wharves
  E: "#92400E", // dark brown  — E Embarcadero
};

// Fallback palette for unlisted bus routes — no red/orange/yellow/green/blue
const FALLBACK = [
  "#9333EA", // purple
  "#DB2777", // pink
  "#0891B2", // cyan
  "#4338CA", // indigo
  "#0F766E", // teal
  "#BE185D", // rose
  "#B45309", // amber-brown
  "#7C3AED", // violet
];

const cache = new Map<string, string>();

export function lineColor(line: string): string {
  const key = line.toUpperCase().trim();
  if (BART[key]) return BART[key];
  if (OTHER[key]) return OTHER[key];
  // Handle 511 BART color-based IDs: "Yellow-N", "Red-S", "BLUE", etc.
  const colorKey = key.replace(/[-_][NS]$/, "");
  if (BART_COLOR[colorKey]) return BART_COLOR[colorKey];
  if (!cache.has(key)) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xff;
    cache.set(key, FALLBACK[hash % FALLBACK.length]);
  }
  return cache.get(key)!;
}

// White text on dark backgrounds, black on light
const DARK_BACKGROUNDS = new Set([
  "#4338CA", // indigo
  "#9333EA", // purple
  "#7C3AED", // violet
  "#0F766E", // teal
  "#BE185D", // rose
  "#B45309", // amber-brown
  "#92400E", // dark brown
  "#0891B2", // cyan
  "#ED1C24", // BART red
  "#009AC7", // BART blue
  "#00AD6F", // BART green
]);

export function lineTextColor(line: string): string {
  return DARK_BACKGROUNDS.has(lineColor(line)) ? "#ffffff" : "#000000";
}
