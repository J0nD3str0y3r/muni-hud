"use client";

import { useEffect, useState } from "react";
import type { RouteOption } from "@/app/api/tripplan/route";

type Props = {
  route: RouteOption;
};

function formatArrival(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatMiles(meters: number) {
  const miles = meters / 1609.34;
  return miles < 0.1
    ? `${Math.round(meters)}m`
    : miles < 10
    ? `${miles.toFixed(1)}mi`
    : `${Math.round(miles)}mi`;
}

function minsRemaining(arrivalMs: number) {
  return Math.max(0, Math.round((arrivalMs - Date.now()) / 60_000));
}

export default function NavPanel({ route }: Props) {
  const [mins, setMins] = useState(() => minsRemaining(route.arrivalTime));

  // Tick every 30s to keep minutes fresh
  useEffect(() => {
    setMins(minsRemaining(route.arrivalTime));
    const id = setInterval(() => setMins(minsRemaining(route.arrivalTime)), 30_000);
    return () => clearInterval(id);
  }, [route.arrivalTime]);

  const distanceM = route.totalDistanceM;

  return (
    <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-4 items-center min-w-[80px]">
      {/* Arrival time */}
      <div className="text-center">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Arrive</div>
        <div className="text-white text-sm font-semibold tabular-nums">
          {formatArrival(route.arrivalTime)}
        </div>
      </div>

      <div className="w-full h-px bg-white/10 my-1" />

      {/* Minutes remaining */}
      <div className="text-center">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Left</div>
        <div className="text-white text-2xl font-bold tabular-nums leading-none">
          {mins}
        </div>
        <div className="text-white/30 text-[9px] mt-0.5">min</div>
      </div>

      <div className="w-full h-px bg-white/10 my-1" />

      {/* Distance remaining */}
      <div className="text-center">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Dist</div>
        <div className="text-white text-sm font-semibold tabular-nums">
          {formatMiles(distanceM)}
        </div>
      </div>
    </div>
  );
}
