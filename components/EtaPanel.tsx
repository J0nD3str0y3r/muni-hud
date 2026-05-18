"use client";

import { useEffect, useState } from "react";
import type { Coords } from "@/app/page";
import type { Arrival } from "@/app/api/arrivals/route";
import { lineColor } from "@/lib/lineColor";

const CARDINAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function toCardinal(deg: number) {
  return CARDINAL[Math.round(deg / 45) % 8];
}
function mpsToMph(mps: number) {
  return (mps * 2.237).toFixed(1);
}

export type StopPin = { lat: number; lng: number; name: string; lines: string[] };

type Props = {
  coords: Coords | null;
  onStopPin?: (pin: StopPin | null) => void;
};

export default function EtaPanel({ coords, onStopPin }: Props) {
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
          const first = data[0];
          if (first) {
            setStopName(first.stopName);
            onStopPin?.({
              lat: first.stopLat,
              lng: first.stopLng,
              name: first.stopName,
              lines: [...new Set(data.map((a) => a.line))],
            });
          } else {
            setStopName(null);
            onStopPin?.(null);
          }
        }
      } catch {
        // retry on next interval
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch511();
    const id = setInterval(fetch511, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMoving = (coords?.speed ?? 0) > 0.5;
  const speedMph = coords?.speed ? mpsToMph(coords.speed) : null;
  const cardinal = coords?.heading != null ? toCardinal(coords.heading) : null;

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 min-w-[190px] max-w-[230px]">

      {/* Speed + heading while moving */}
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

      {/* Stop name */}
      <div className="text-white/30 text-[9px] uppercase tracking-widest mb-1">Nearest stop</div>
      <div className="text-white/60 text-[10px] mb-2.5 truncate font-medium">
        {stopName ?? (loading ? "Finding…" : "—")}
      </div>

      {/* Arrivals */}
      {!coords ? (
        <span className="text-white/20 text-xs">acquiring location…</span>
      ) : arrivals.length === 0 && !loading ? (
        <span className="text-white/20 text-xs">no arrivals</span>
      ) : (
        <div className="space-y-2">
          {arrivals.slice(0, 4).map((a, i) => {
            const color = lineColor(a.line);
            return (
              <div key={i} className="flex items-center gap-2">
                {/* Color-coded line badge */}
                <span
                  className="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0 min-w-[30px] text-center text-black"
                  style={{ backgroundColor: color }}
                >
                  {a.line}
                </span>
                {/* Headsign */}
                <span className="text-white/40 text-[10px] flex-1 truncate">{a.headsign}</span>
                {/* ETA */}
                <span className="text-white text-xs font-semibold tabular-nums shrink-0">
                  {a.minutes === 0 ? "now" : `${a.minutes}m`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
