"use client";

import { useEffect, useState } from "react";
import type { Coords } from "@/app/page";
import type { Arrival } from "@/app/api/arrivals/route";

const CARDINAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function toCardinal(deg: number) {
  return CARDINAL[Math.round(deg / 45) % 8];
}
function mpsToMph(mps: number) {
  return (mps * 2.237).toFixed(1);
}

export default function EtaPanel({ coords }: { coords: Coords | null }) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [stopName, setStopName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    async function fetch511() {
      setLoading(true);
      try {
        const res = await fetch(`/api/arrivals?lat=${coords!.lat}&lng=${coords!.lng}`);
        if (!res.ok) throw new Error();
        const data: Arrival[] = await res.json();
        if (!cancelled) {
          setArrivals(data);
          setStopName(data[0]?.stopName ?? null);
        }
      } catch {
        // retry on next tick
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch511();
    const id = setInterval(fetch511, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coords]);

  const isMoving = (coords?.speed ?? 0) > 0.5;
  const speedMph = coords?.speed ? mpsToMph(coords.speed) : null;
  const cardinal = coords?.heading != null ? toCardinal(coords.heading) : null;

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 min-w-[180px] max-w-[220px]">

      {/* Speed + heading — only while moving */}
      {isMoving && (speedMph || cardinal) && (
        <div className="flex items-baseline gap-2 mb-2 pb-2 border-b border-white/10">
          {speedMph && (
            <span className="text-white text-base font-semibold tabular-nums">
              {speedMph}
              <span className="text-white/40 text-[10px] ml-0.5">mph</span>
            </span>
          )}
          {cardinal && (
            <span className="text-white/50 text-xs tracking-widest ml-auto">{cardinal}</span>
          )}
        </div>
      )}

      {/* Stop label */}
      <div className="text-white/30 text-[9px] uppercase tracking-widest mb-1.5 truncate">
        {stopName ? `Nearest stop` : loading ? "Finding stop…" : "No stop found"}
      </div>
      {stopName && (
        <div className="text-white/60 text-[10px] mb-2 truncate font-medium">{stopName}</div>
      )}

      {/* Arrivals */}
      {!coords ? (
        <span className="text-white/20 text-xs">acquiring location…</span>
      ) : arrivals.length === 0 && !loading ? (
        <span className="text-white/20 text-xs">no arrivals</span>
      ) : (
        <div className="space-y-1.5">
          {arrivals.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-baseline gap-2">
              {/* Line badge */}
              <span className="text-[10px] font-bold bg-white/10 text-white/80 rounded px-1.5 py-0.5 shrink-0 min-w-[28px] text-center">
                {a.line}
              </span>
              {/* Headsign */}
              <span className="text-white/40 text-[10px] flex-1 truncate">{a.headsign}</span>
              {/* ETA */}
              <span className="text-white text-xs font-semibold tabular-nums shrink-0">
                {a.minutes === 0 ? "now" : `${a.minutes}m`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
