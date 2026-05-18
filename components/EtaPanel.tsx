"use client";

import { useEffect, useState } from "react";
import type { Coords } from "@/app/page";

type Arrival = {
  stopName: string;
  line: string;
  minutes: number;
};

export default function EtaPanel({ coords }: { coords: Coords | null }) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;

    async function fetchArrivals() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/arrivals?lat=${coords!.lat}&lng=${coords!.lng}`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data: Arrival[] = await res.json();
        if (!cancelled) setArrivals(data);
      } catch {
        // silently retry on next interval
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchArrivals();
    const id = setInterval(fetchArrivals, 30_000); // refresh every 30s
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [coords]);

  if (!coords) {
    return <Panel><span className="text-white/30 text-xs">acquiring location…</span></Panel>;
  }

  if (loading && arrivals.length === 0) {
    return <Panel><span className="text-white/30 text-xs">loading…</span></Panel>;
  }

  if (arrivals.length === 0) {
    return <Panel><span className="text-white/30 text-xs">no arrivals found</span></Panel>;
  }

  return (
    <Panel>
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
