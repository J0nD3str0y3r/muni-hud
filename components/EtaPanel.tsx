"use client";

import { useEffect, useState } from "react";
import type { Coords } from "@/app/page";

type Arrival = {
  stopName: string;
  line: string;
  minutes: number;
};

const CARDINAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function toCardinal(deg: number) {
  return CARDINAL[Math.round(deg / 45) % 8];
}

function mpsToMph(mps: number) {
  return (mps * 2.237).toFixed(1);
}

export default function EtaPanel({ coords }: { coords: Coords | null }) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    async function fetchArrivals() {
      setLoading(true);
      try {
        const res = await fetch(`/api/arrivals?lat=${coords!.lat}&lng=${coords!.lng}`);
        if (!res.ok) throw new Error();
        const data: Arrival[] = await res.json();
        if (!cancelled) setArrivals(data);
      } catch {
        // retry on next interval
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchArrivals();
    const id = setInterval(fetchArrivals, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [coords]);

  const isMoving = coords?.speed !== null && (coords?.speed ?? 0) > 0.5;
  const speedMph = coords?.speed ? mpsToMph(coords.speed) : null;
  const cardinal = coords?.heading != null ? toCardinal(coords.heading) : null;

  return (
    <Panel>
      {/* Speed + heading row — only shown when moving */}
      {isMoving && (
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

      {/* MUNI arrivals */}
      {!coords ? (
        <span className="text-white/30 text-xs">acquiring location…</span>
      ) : loading && arrivals.length === 0 ? (
        <span className="text-white/30 text-xs">loading…</span>
      ) : arrivals.length === 0 ? (
        <span className="text-white/30 text-xs">no arrivals nearby</span>
      ) : (
        <>
          {arrivals.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-baseline gap-3">
              <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase w-16 truncate">
                {a.line}
              </span>
              <span className="text-white text-sm font-semibold tabular-nums">
                {a.minutes === 0 ? "now" : `${a.minutes}m`}
              </span>
            </div>
          ))}
          <div className="text-[9px] text-white/20 mt-1 truncate max-w-[160px]">
            {arrivals[0]?.stopName}
          </div>
        </>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 min-w-[140px]">
      {children}
    </div>
  );
}
