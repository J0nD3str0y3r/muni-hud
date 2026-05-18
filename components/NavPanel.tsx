"use client";

import { useMemo } from "react";
import type { RouteOption } from "@/app/api/tripplan/route";
import type { Coords } from "@/app/page";

type Props = {
  route: RouteOption;
  coords: Coords | null;
};

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

export default function NavPanel({ route, coords }: Props) {
  // Destination = last coordinate of last leg
  const dest = useMemo(() => {
    const lastLeg = route.legs[route.legs.length - 1];
    const geom = lastLeg?.geometry ?? [];
    return geom[geom.length - 1] ?? null; // [lng, lat]
  }, [route]);

  const { remainingM, remainingMins, arrivalMs } = useMemo(() => {
    if (!dest || !coords) {
      // Fall back to original estimate
      return {
        remainingM: route.totalDistanceM,
        remainingMins: Math.round(route.totalDurationSec / 60),
        arrivalMs: route.arrivalTime,
      };
    }

    const remainingM = haversineM(coords.lat, coords.lng, dest[1], dest[0]);

    // Pace from original route (sec/m), clamped so it doesn't explode near destination
    const paceSecPerM = route.totalDurationSec / Math.max(route.totalDistanceM, 1);
    const remainingSec = remainingM * paceSecPerM;
    const remainingMins = Math.max(0, Math.round(remainingSec / 60));
    const arrivalMs = Date.now() + remainingSec * 1000;

    return { remainingM, remainingMins, arrivalMs };
  }, [coords, dest, route]);

  return (
    <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-4 items-center min-w-[80px]">
      <div className="text-center">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Arrive</div>
        <div className="text-white text-sm font-semibold tabular-nums">
          {formatArrival(arrivalMs)}
        </div>
      </div>

      <div className="w-full h-px bg-white/10 my-1" />

      <div className="text-center">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Left</div>
        <div className="text-white text-2xl font-bold tabular-nums leading-none">
          {remainingMins}
        </div>
        <div className="text-white/30 text-[9px] mt-0.5">min</div>
      </div>

      <div className="w-full h-px bg-white/10 my-1" />

      <div className="text-center">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Dist</div>
        <div className="text-white text-sm font-semibold tabular-nums">
          {formatMiles(remainingM)}
        </div>
      </div>
    </div>
  );
}
