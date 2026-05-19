"use client";

import { useEffect, useState } from "react";
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

export default function EtaPanel({ coords, destination, routeOptions, onStopPin }: Props) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    async function poll() {
      setLoading(true);
      try {
        const res = await fetch(`/api/arrivals?lat=${coords!.lat}&lng=${coords!.lng}`);
        if (!res.ok) throw new Error();
        const data: Arrival[] = await res.json();
        if (!cancelled) {
          setArrivals(data);
          const first = data[0];
          onStopPin?.(first ? {
            lat: first.stopLat,
            lng: first.stopLng,
            name: first.stopName,
            lines: [...new Set(data.map((a) => a.line))],
          } : null);
        }
      } catch { /* retry next interval */ }
      finally { if (!cancelled) setLoading(false); }
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!coords) return null;

  const primary = arrivals[0] ?? null;

  // ── No destination: ambient mode ─────────────────────────────────────────────
  if (!destination) {
    if (!primary) return null;

    const label = routeLabel(primary.line, primary.agency);
    const headsign = cleanHeadsign(primary.headsign);

    return (
      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 w-52">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
            style={{ background: lineColor(primary.line), color: lineTextColor(primary.line) }}
          >
            {primary.line}
          </span>
          <span className="text-white/70 text-xs truncate">
            {label}{headsign ? ` → ${headsign}` : ""}
          </span>
        </div>
        <div className="text-white/40 text-[10px]">
          {primary.minutes <= 1 ? "Leaving now" : `${primary.minutes} min · ${primary.stopName}`}
        </div>
        {/* Secondary arrival */}
        {arrivals[1] && (() => {
          const sec = arrivals[1];
          const secHeadsign = cleanHeadsign(sec.headsign);
          return (
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded shrink-0"
                style={{ background: lineColor(sec.line), color: lineTextColor(sec.line) }}
              >
                {sec.line}
              </span>
              <span className="text-white/30 text-[10px] truncate">
                {routeLabel(sec.line, sec.agency)}{secHeadsign ? ` → ${secHeadsign}` : ""} · {sec.minutes}m
              </span>
            </div>
          );
        })()}
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
  const label = routeLabel(primary.line, primary.agency);
  const headsign = cleanHeadsign(primary.headsign);
  const arrLabel = arrivalLabel(primary.minutes, rec);
  const destName = destination.name.split(",")[0];

  // Brighten card when transit is worth taking
  const cardOpacity = rec === "KEEP_MOVING" ? "opacity-60" : "opacity-100";
  const cardBorder = rec === "TAKE_TRANSIT"
    ? "border-white/30"
    : "border-white/10";

  // Secondary option (different line, different headsign)
  const secondary = arrivals.find(
    (a) => a.line !== primary.line && a.minutes > primary.minutes
  ) ?? null;

  return (
    <div className={`bg-black/70 backdrop-blur-md border ${cardBorder} rounded-xl px-4 py-3 w-56 shadow-xl transition-all ${cardOpacity}`}>

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
          {/* Line + headsign */}
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
              style={{ background: lineColor(primary.line), color: lineTextColor(primary.line) }}
            >
              {primary.line}
            </span>
            <span className="text-white text-xs font-semibold truncate">
              {label}{headsign ? ` → ${headsign}` : ""}
            </span>
          </div>

          {/* Arrival urgency */}
          <div className={`text-xs font-medium ${primary.minutes <= 1 ? "text-amber-400" : "text-white/70"}`}>
            {arrLabel} · {primary.minutes <= 1 ? "1 min" : `${primary.minutes} min`}
          </div>

          {/* Similar time note for optional */}
          {rec === "TRANSIT_OPTIONAL" && (
            <div className="text-white/35 text-[10px]">Similar time to walking</div>
          )}

          {/* Fare + stop */}
          <div className="border-t border-white/10 pt-2 space-y-0.5">
            <div className="text-white/40 text-[10px]">{fareLabel(primary.agency)}</div>
            <div className="text-white/30 text-[10px] truncate">{primary.stopName}</div>
          </div>

          {/* Secondary option */}
          {secondary && (() => {
            const secHeadsign = cleanHeadsign(secondary.headsign);
            return (
              <div className="border-t border-white/5 pt-1.5 text-white/30 text-[10px] flex items-center gap-1.5">
                <span
                  className="text-[9px] font-black px-1 py-0.5 rounded shrink-0"
                  style={{ background: lineColor(secondary.line), color: lineTextColor(secondary.line) }}
                >
                  {secondary.line}
                </span>
                <span className="truncate">
                  Also: {routeLabel(secondary.line, secondary.agency)} · {secondary.minutes}m
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
