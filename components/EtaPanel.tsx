"use client";

import { useEffect, useRef, useState } from "react";
import type { Coords } from "@/app/page";
import type { Destination } from "@/components/SearchBar";
import type { Arrival } from "@/app/api/arrivals/route";
import type { RouteOption } from "@/app/api/tripplan/route";
import { lineColor, lineTextColor } from "@/lib/lineColor";

export type StopPin = { lat: number; lng: number; name: string; lines: string[] };

type Props = {
  coords: Coords | null;
  destination?: Destination | null;
  routeOptions?: RouteOption[] | null;
  onStopPin?: (pin: StopPin | null) => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const BART_LINES: Record<string, string> = {
  ANTC: "Antioch", BERY: "Berryessa", DALY: "Daly City",
  DUBL: "Dublin", MLBR: "Millbrae", NCON: "N Concord",
  RICH: "Richmond", SFIA: "SFO", WARM: "Warm Springs",
  RED: "Red Line", ORANGE: "Orange Line", YELLOW: "Yellow Line",
  GREEN: "Green Line", BLUE: "Blue Line",
};

function isBartLine(line: string): boolean {
  const key = line.toUpperCase().replace(/[-_][NS]$/, "");
  return key in BART_LINES || ["YELLOW","ORANGE","GREEN","BLUE","RED"].includes(key);
}

function routeLabel(line: string, agency?: "MUNI" | "BART"): string {
  if (agency === "BART") return BART_LINES[line.toUpperCase()] ?? `BART ${line}`;
  if (/R$/i.test(line)) return `${line} Rapid`;
  if (/X$/i.test(line)) return `${line} Express`;
  if (/^[JKLMNT]$/i.test(line)) return `${line} Metro`;
  if (/^[EF]$/i.test(line)) return `${line} Streetcar`;
  return `${line} Local`;
}

function cleanHeadsign(headsign: string): string {
  // Strip stop-address patterns like "Mission St & 8th St" — keep named destinations
  if (/\b(St|Ave|Blvd|Dr|Rd|Ln|Way|Pl)\b.*&/.test(headsign)) return "";
  // Trim operator jargon
  return headsign.replace(/\s*(Inbound|Outbound|IB|OB)\s*/i, "").trim();
}

type Recommendation = "TAKE_TRANSIT" | "TRANSIT_OPTIONAL" | "KEEP_MOVING" | "AMBIENT";

function classify(timeSavedMin: number): Recommendation {
  if (timeSavedMin >= 8) return "TAKE_TRANSIT";
  if (timeSavedMin >= 3) return "TRANSIT_OPTIONAL";
  return "KEEP_MOVING";
}

function arrivalLabel(minutes: number, rec: Recommendation): string {
  if (minutes <= 1) return "Leaving soon";
  if (minutes >= 8 && rec === "TAKE_TRANSIT") return "Worth waiting";
  return "Arrives in";
}

function fareLabel(agency: "MUNI" | "BART"): string {
  return agency === "BART" ? "$2.65+ · BART" : "$2.85 · MUNI";
}

// ── Component ──────────────────────────────────────────────────────────────────

// Short service type for "X toward Y"
function transitTypeLabel(line: string, agency: "MUNI" | "BART"): string {
  if (agency === "BART") return "BART";
  if (/R$/i.test(line)) return "Rapid";
  if (/X$/i.test(line)) return "Express";
  if (/^[JKLMNT]$/i.test(line)) return "Metro";
  if (/^[EF]$/i.test(line)) return "Streetcar";
  return "Local";
}

function walkMin(coords: Coords, stopLat: number, stopLng: number): number {
  return Math.max(1, Math.round(haversineM(coords.lat, coords.lng, stopLat, stopLng) / 1.4 / 60));
}

// ── Direction helpers ────────────────────────────────────────────────────────

// Infer bearing when vehicle GPS bearing isn't available
function effectiveBearing(a: Arrival): number | undefined {
  if (a.bearing != null) return a.bearing;
  // BART always N/S
  if (a.agency === "BART") {
    const dir = (a.directionRef ?? "").toUpperCase();
    if (dir === "N" || dir === "NB") return 0;
    if (dir === "S" || dir === "SB") return 180;
    // Infer from headsign: Pittsburg/Richmond/Concord/Antioch = northbound
    const north = /pittsburg|richmond|concord|antioch|berryessa|warm springs|sfia|millbrae/i;
    const south = /daly city|sfo|millbrae|dublin|pleasanton/i;
    if (north.test(a.headsign)) return 0;
    if (south.test(a.headsign)) return 180;
  }
  // MUNI: IB = toward downtown (east), OB = away (west) — rough but useful
  if (a.agency === "MUNI") {
    const dir = (a.directionRef ?? "").toUpperCase();
    if (dir === "IB") return 90;
    if (dir === "OB") return 270;
  }
  return undefined;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const ARROW   = ["↑",    "↗",         "→",    "↘",          "↓",     "↙",          "←",    "↖"];

function bearingToIndex(deg: number): number {
  return Math.round(((deg % 360) + 360) % 360 / 45) % 8;
}

function directionLabel(a: Arrival): { compass: string; arrow: string } | null {
  const b = effectiveBearing(a);
  if (b == null) return null;
  const i = bearingToIndex(b);
  return { compass: COMPASS[i], arrow: ARROW[i] };
}

// Angle difference between two bearings (0-180)
function bearingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Bearing from one lat/lng to another
function toBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Is this vehicle heading toward the destination (within 90°)?
function isTowardDest(a: Arrival, destLat: number, destLng: number): boolean | null {
  const b = effectiveBearing(a);
  if (b == null) return null;
  const needed = toBearing(a.stopLat, a.stopLng, destLat, destLng);
  return bearingDiff(b, needed) < 90;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

// Dedupe by line+direction keeping soonest per combo
function dedupeByDirection(arrivals: Arrival[]): Arrival[] {
  const seen = new Set<string>();
  return arrivals.filter((a) => {
    const key = `${a.line}|${a.directionRef ?? a.headsign}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type LineGroup = { line: string; departures: Arrival[] };

// Group deduplicated arrivals by line; each group holds 1-2 directional departures
function groupByLine(arrivals: Arrival[]): LineGroup[] {
  const map = new Map<string, LineGroup>();
  for (const a of dedupeByDirection(arrivals)) {
    if (!map.has(a.line)) map.set(a.line, { line: a.line, departures: [] });
    map.get(a.line)!.departures.push(a);
  }
  // Sort each group by minutes; sort groups by their soonest departure
  for (const g of map.values()) g.departures.sort((a, b) => a.minutes - b.minutes);
  return [...map.values()].sort((a, b) => a.departures[0].minutes - b.departures[0].minutes);
}

type StopGroup = {
  stopName: string;
  stopLat: number;
  stopLng: number;
  wMin: number;
  arrivals: Arrival[];
};

function groupByStop(arrivals: Arrival[], coords: Coords): StopGroup[] {
  const map = new Map<string, StopGroup>();
  for (const a of arrivals) {
    if (!map.has(a.stopName)) {
      map.set(a.stopName, {
        stopName: a.stopName, stopLat: a.stopLat, stopLng: a.stopLng,
        wMin: walkMin(coords, a.stopLat, a.stopLng), arrivals: [],
      });
    }
    map.get(a.stopName)!.arrivals.push(a);
  }
  return [...map.values()].sort((a, b) => a.wMin - b.wMin);
}

export default function EtaPanel({ coords, destination, routeOptions, onStopPin }: Props) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Always holds the latest coords without being a dep that restarts the poll
  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;

  // Ref-stable onStopPin so it doesn't restart the effect
  const onStopPinRef = useRef(onStopPin);
  onStopPinRef.current = onStopPin;

  // Refs that survive across GPS-triggered effect re-runs
  const pollingStarted = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(true);

  // Start polling once when coords first becomes available.
  // GPS ticks cause this effect to re-run, but pollingStarted blocks restart.
  // The interval lives in a ref so the cleanup below doesn't kill it on GPS updates.
  useEffect(() => {
    if (!coords || pollingStarted.current) return;
    pollingStarted.current = true;

    async function poll() {
      const c = coordsRef.current;
      if (!c || !activeRef.current) return;
      try {
        const res = await fetch(`/api/arrivals?lat=${c.lat}&lng=${c.lng}`);
        if (!res.ok) throw new Error();
        const data: Arrival[] = await res.json();
        if (!activeRef.current) return;
        if (data.length > 0) {
          setArrivals(data);
          const first = data[0];
          onStopPinRef.current?.(first ? {
            lat: first.stopLat,
            lng: first.stopLng,
            name: first.stopName,
            lines: [...new Set(data.map((a) => a.line))],
          } : null);
        }
      } catch { /* retry next interval */ }
    }

    poll();
    intervalRef.current = setInterval(poll, 30_000);
    // No cleanup returned here — GPS updates re-trigger this effect but pollingStarted
    // blocks a restart; the interval must survive coord changes.
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unmount-only cleanup — runs once when the component is destroyed
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!coords) return null;

  const primary = arrivals[0] ?? null;

  // ── No destination: ambient mode ─────────────────────────────────────────────
  if (!destination) {
    if (!primary) return null;

    const lineGroups = groupByLine(arrivals);
    const stopGroups = groupByStop(arrivals, coords);
    // "blocks" = line groups in collapsed view; cap at 2 visible
    const visibleGroups = expanded ? lineGroups : lineGroups.slice(0, 2);
    const hiddenCount = Math.max(0, lineGroups.length - 2);

    return (
      <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 w-64 shadow-xl">
        {/* Title */}
        <div className="text-white/30 text-[9px] font-bold tracking-widest uppercase mb-3">
          Catch Nearby
        </div>

        {expanded ? (
          /* ── Expanded: grouped by stop ─────────────────────────────── */
          <div className="space-y-4">
            {stopGroups.map((g) => (
              <div key={g.stopName}>
                <div className="text-white/50 text-[10px] font-semibold mb-1.5">
                  {g.stopName} · {g.wMin} min walk
                </div>
                <div className="space-y-1.5 pl-1">
                  {g.arrivals.map((a, i) => {
                    const headsign = cleanHeadsign(a.headsign);
                    const dir = directionLabel(a);
                    return (
                      <div key={`${a.line}-${i}`} className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: lineColor(a.line), color: lineTextColor(a.line) }}
                        >
                          {a.line}
                        </span>
                        {dir && <span className="text-white/40 text-[10px] shrink-0">{dir.arrow}</span>}
                        <span className={`text-[10px] tabular-nums shrink-0 ${a.minutes <= 1 ? "text-amber-400" : "text-white/60"}`}>
                          {a.minutes <= 1 ? "now" : `${a.minutes} min`}
                        </span>
                        {headsign && (
                          <span className="text-white/30 text-[10px] leading-snug">
                            toward {headsign}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Collapsed: line groups with directional departures ─────── */
          <div className="space-y-3">
            {visibleGroups.map((g, gi) => {
              const wMin = walkMin(coords, g.departures[0].stopLat, g.departures[0].stopLng);
              return (
                <div key={g.line} className={gi > 0 ? "border-t border-white/5 pt-3" : ""}>
                  {/* One row per direction within this line */}
                  {g.departures.map((a, di) => {
                    const headsign = cleanHeadsign(a.headsign);
                    const dir = directionLabel(a);
                    return (
                      <div key={`${a.line}-${di}`} className={di > 0 ? "mt-2 pt-2 border-t border-white/[0.04]" : ""}>
                        {/* Line badge · arrow · minutes */}
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
                              style={{ background: lineColor(a.line), color: lineTextColor(a.line) }}
                            >
                              {a.line}
                            </span>
                            {dir && (
                              <span className="text-white/50 text-sm leading-none">{dir.arrow}</span>
                            )}
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${a.minutes <= 1 ? "text-amber-400" : "text-white/80"}`}>
                            {a.minutes <= 1 ? "now" : `${a.minutes} min`}
                          </span>
                        </div>
                        {/* Service type toward headsign */}
                        <div className="text-white/60 text-[10px] leading-snug mb-0.5">
                          {transitTypeLabel(a.line, a.agency)}{headsign ? ` toward ${headsign}` : ""}
                        </div>
                        {/* Stop + walk (only on first direction row) */}
                        {di === 0 && (
                          <div className="text-white/30 text-[10px] leading-snug">
                            {a.stopName} · {wMin} min walk
                            {dir ? ` · going ${dir.compass}` : ""}
                          </div>
                        )}
                        {/* Opposite direction gets board-other-side note */}
                        {di > 0 && (
                          <div className="text-white/25 text-[10px] leading-snug">
                            Board opposite side{dir ? ` · going ${dir.compass}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Expand / collapse */}
        {(hiddenCount > 0 || expanded) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 pt-2 border-t border-white/5 w-full text-left text-white/25 text-[10px] hover:text-white/50 transition-colors"
          >
            {expanded ? "▲ show less" : `+${hiddenCount} more nearby`}
          </button>
        )}
      </div>
    );
  }

  // ── Decision mode ─────────────────────────────────────────────────────────────

  // Use real Google Maps durations when available, fall back to haversine estimate
  const walkRoute = routeOptions?.find((o) => o.profile === "walking");
  const bestTransitRoute = routeOptions
    ?.filter((o) => o.profile === "transit")
    .sort((a, b) => a.totalDurationSec - b.totalDurationSec)[0] ?? null;

  const walkTimeSec = walkRoute?.totalDurationSec
    ?? (haversineM(coords.lat, coords.lng, destination.lat, destination.lng) / 1.4);

  if (!primary) {
    const walkMins = Math.round(walkTimeSec / 60);
    return (
      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 w-52 opacity-60">
        <div className="text-white/80 text-sm font-semibold mb-1">🚶 Walking is faster</div>
        <div className="text-white/40 text-xs">No useful transit nearby</div>
        <div className="text-white/30 text-[10px] mt-1">
          Keep going · {walkMins} min to {destination.name.split(",")[0]}
        </div>
      </div>
    );
  }

  // Transit total time: use real route if available, else estimate from arrivals data
  const transitTotalSec = bestTransitRoute?.totalDurationSec
    ?? (() => {
      const walkToStopSec = haversineM(coords.lat, coords.lng, primary.stopLat, primary.stopLng) / 1.4;
      const waitSec = primary.minutes * 60;
      const rideSec = haversineM(primary.stopLat, primary.stopLng, destination.lat, destination.lng) / 6;
      return walkToStopSec + waitSec + rideSec;
    })();

  const timeSavedSec = walkTimeSec - transitTotalSec;
  const timeSavedMin = timeSavedSec / 60;

  const rec = classify(timeSavedMin);
  const destName = destination.name.split(",")[0];

  // Prefer the best route's transit leg for display — it corresponds to the fastest
  // option to the destination, which may differ from arrivals[0] (nearest vehicle).
  const bestTransitLeg = bestTransitRoute?.legs.find((l) => l.mode === "TRANSIT") ?? null;

  const displayLine = bestTransitLeg?.line ?? primary.line;
  const displayAgency = bestTransitLeg?.line
    ? (isBartLine(bestTransitLeg.line) ? "BART" : "MUNI")
    : primary.agency;
  const displayHeadsign = bestTransitLeg
    ? cleanHeadsign(bestTransitLeg.headsign ?? "")
    : cleanHeadsign(primary.headsign);
  const displayStopName = bestTransitLeg?.boardStopName ?? primary.stopName;
  // Wait time: from route's waitSec, or fall back to the arrival minutes
  const displayWaitMin = bestTransitLeg?.waitSec != null
    ? Math.round(bestTransitLeg.waitSec / 60)
    : primary.minutes;

  const label = routeLabel(displayLine, displayAgency);
  const arrLabel = arrivalLabel(displayWaitMin, rec);
  // Direction info: use matched arrival from feed if available
  const matchedArrival = arrivals.find((a) => a.line === displayLine);
  const displayDir = matchedArrival ? directionLabel(matchedArrival) : null;
  const towardDest = matchedArrival ? isTowardDest(matchedArrival, destination.lat, destination.lng) : null;

  // Brighten card when transit is worth taking
  const cardOpacity = rec === "KEEP_MOVING" ? "opacity-60" : "opacity-100";
  const cardBorder = rec === "TAKE_TRANSIT"
    ? "border-white/30"
    : "border-white/10";

  // Second-best transit route for the secondary slot
  const secondBestRoute = routeOptions
    ?.filter((o) => o.profile === "transit" && o.id !== bestTransitRoute?.id)
    .sort((a, b) => a.totalDurationSec - b.totalDurationSec)[0] ?? null;
  const secondBestLeg = secondBestRoute?.legs.find((l) => l.mode === "TRANSIT") ?? null;

  return (
    <div className={`bg-black/70 backdrop-blur-md border ${cardBorder} rounded-xl px-4 py-3 w-60 shadow-xl transition-all ${cardOpacity}`}>

      {/* Recommendation headline */}
      <div className="text-white text-sm font-bold mb-2.5 leading-snug">
        {rec === "TAKE_TRANSIT" && (
          <>🚍 Transit saves {Math.round(timeSavedMin)} min</>
        )}
        {rec === "TRANSIT_OPTIONAL" && (
          <>🚍 Transit nearby</>
        )}
        {rec === "KEEP_MOVING" && (
          <>🚶 Walking is faster</>
        )}
      </div>

      {rec === "KEEP_MOVING" ? (
        <div className="space-y-1">
          <div className="text-white/40 text-xs">No useful transit nearby</div>
          <div className="text-white/30 text-[10px]">
            Keep going to {destName}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Line badge + direction arrow + arrival time */}
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
              style={{ background: lineColor(displayLine), color: lineTextColor(displayLine) }}
            >
              {displayLine}
            </span>
            {displayDir && (
              <span className="text-white/60 text-sm leading-none">{displayDir.arrow}</span>
            )}
            <span className={`text-xs font-medium ${displayWaitMin <= 1 ? "text-amber-400" : "text-white/70"}`}>
              {arrLabel} · {displayWaitMin <= 1 ? "1 min" : `${displayWaitMin} min`}
            </span>
          </div>

          {/* Service type toward headsign */}
          <div className="text-white text-xs font-semibold leading-snug">
            {transitTypeLabel(displayLine, displayAgency)}{displayHeadsign ? ` toward ${displayHeadsign}` : ""}
          </div>

          {/* Direction confidence + similar-time note */}
          {towardDest === false && (
            <div className="text-red-400/70 text-[10px]">Wrong direction — board opposite side</div>
          )}
          {rec === "TRANSIT_OPTIONAL" && towardDest !== false && (
            <div className="text-white/35 text-[10px]">Similar time to walking</div>
          )}

          {/* Fare + board stop + compass direction */}
          <div className="border-t border-white/10 pt-2 space-y-0.5">
            <div className="text-white/40 text-[10px]">{fareLabel(displayAgency)}</div>
            <div className="text-white/30 text-[10px] leading-snug">
              {displayStopName}
              {displayDir ? ` · going ${displayDir.compass}` : ""}
            </div>
          </div>

          {/* Second-best transit route */}
          {secondBestLeg && (() => {
            const secLine = secondBestLeg.line ?? "";
            const secHeadsign = cleanHeadsign(secondBestLeg.headsign ?? "");
            const secMins = secondBestLeg.waitSec != null
              ? Math.round(secondBestLeg.waitSec / 60)
              : null;
            const secAgency = isBartLine(secLine) ? "BART" : "MUNI";
            return (
              <div className="border-t border-white/5 pt-1.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[9px] font-black px-1 py-0.5 rounded shrink-0"
                    style={{ background: lineColor(secLine), color: lineTextColor(secLine) }}
                  >
                    {secLine}
                  </span>
                  {secMins != null && (
                    <span className="text-white/25 text-[10px]">{secMins}m · {Math.round((secondBestRoute?.totalDurationSec ?? 0) / 60)} min total</span>
                  )}
                </div>
                <div className="text-white/25 text-[10px] leading-snug">
                  {routeLabel(secLine, secAgency)}{secHeadsign ? ` → ${secHeadsign}` : ""}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
