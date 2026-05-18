"use client";

import type { RouteOption } from "@/app/api/tripplan/route";
import type { Coords } from "@/app/page";
import { lineColor, lineTextColor } from "@/lib/lineColor";

type Props = {
  route: RouteOption;
  coords: Coords | null;
  destinationName: string;
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

function formatMins(sec: number) {
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function TransitCard({ route, coords, destinationName }: Props) {
  if (route.profile !== "transit") return null;

  const transitLeg = route.legs.find((l) => l.mode === "TRANSIT");
  const firstWalkLeg = route.legs[0];
  if (!transitLeg) return null;

  // Live remaining walk time based on current distance to the stop
  const stopCoord = transitLeg.geometry[0];
  const remainingWalkSec = coords && stopCoord
    ? (haversineM(coords.lat, coords.lng, stopCoord[1], stopCoord[0]) / 1.4)
    : firstWalkLeg?.durationSec ?? 0;

  const waitMins = transitLeg.waitSec ? Math.round(transitLeg.waitSec / 60) : null;
  const alreadyAtStop = remainingWalkSec < 60;

  return (
    <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3 w-52 shadow-2xl space-y-2">
      {/* Line → headsign • wait */}
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
          style={{
            background: lineColor(transitLeg.line ?? ""),
            color: lineTextColor(transitLeg.line ?? ""),
          }}
        >
          {transitLeg.line}
        </span>
        <span className="text-white text-sm font-semibold truncate">
          → {transitLeg.headsign}
        </span>
        {waitMins !== null && (
          <span className="text-white/50 text-xs shrink-0">• {waitMins}m</span>
        )}
      </div>

      {/* Board stop */}
      <div className="text-white/60 text-xs">
        {alreadyAtStop
          ? `At ${transitLeg.boardStopName}`
          : `${formatMins(remainingWalkSec)} walk · ${transitLeg.boardStopName}`}
      </div>

      {/* Alight stop */}
      {transitLeg.alightStopName && (
        <div className="text-white/40 text-[10px]">
          Get off at {transitLeg.alightStopName}
        </div>
      )}

      {/* Destination + arrival */}
      <div className="border-t border-white/10 pt-2 flex items-center justify-between">
        <span className="text-white/40 text-[10px] truncate max-w-[120px]">
          {destinationName.split(",")[0]}
        </span>
        <span className="text-white/60 text-[10px] tabular-nums shrink-0">
          arr {formatTime(route.arrivalTime)}
        </span>
      </div>
    </div>
  );
}
