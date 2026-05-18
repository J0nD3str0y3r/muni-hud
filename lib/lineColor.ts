// Consistent color per MUNI line — same color shown on map pin and ETA panel row
const COLORS = [
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
  if (!cache.has(key)) {
    // Simple hash so same line always gets same color across renders
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xff;
    cache.set(key, COLORS[hash % COLORS.length]);
  }
  return cache.get(key)!;
}
