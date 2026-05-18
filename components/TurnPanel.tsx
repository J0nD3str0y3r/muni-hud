"use client";

import { useMemo } from "react";
import type { RouteOption, RouteLeg } from "@/app/api/tripplan/route";
import type { Coords } from "@/app/page";
import { lineColor } from "@/lib/lineColor";

type Props = {
  route: RouteOption;
  coords: Coords | null;
  destination: { name: string; arrivalTime: number };
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

function getBearing(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatDist(m: number) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatMins(sec: number) {
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
}

// Small directional arrow relative to heading
function DirectionArrow({ bearing, heading }: { bearing: number; heading: number | null }) {
  const angle = heading !== null ? (bearing - heading + 360) % 360 : bearing;
  return (
    <span
      style={{
        display: "inline-block",
        transform: `rotate(${angle}deg)`,
        transition: "transform 0.4s ease",
        fontSize: 16,
        lineHeight: 1,
      }}
    >
      ▲
    </span>
  );
}

// Determine which leg index the user is currently on by proximity to leg end points
function getCurrentLegIndex(legs: RouteLeg[], coords: Coords): number {
  for (let i = 0; i < legs.length - 1; i++) {
    const leg = legs[i];
    const endCoord = leg.geometry[leg.geometry.length - 1];
    if (!endCoord) continue;
    const distToEnd = haversineM(coords.lat, coords.lng, endCoord[1], endCoord[0]);
    // If still more than 30m from this leg's endpoint, we're on this leg
    if (distToEnd > 30) return i;
  }
  return legs.length - 1;
}

export default function TurnPanel({ route, coords, destination }: Props) {
  const legIdx = useMemo(() => {
    if (!coords) return 0;
    return getCurrentLegIndex(route.legs, coords);
  }, [coords, route.legs]);

  const leg = route.legs[legIdx];
  if (!leg) return null;

  const nextLeg = route.legs[legIdx + 1] ?? null;
  const isTransitRoute = route.profile === "transit";

  // Compute distance and bearing to the next waypoint
  const targetCoord: [number, number] | null = (() => {
    if (leg.mode === "WALK" && nextLeg) {
      // Walking to a stop — point toward the stop (start of next leg)
      return nextLeg.geometry[0] ?? null;
    }
    // Walking to destination or any other leg — point toward end of current leg
    return leg.geometry[leg.geometry.length - 1] ?? null;
  })();

  const distToTarget = coords && targetCoord
    ? haversineM(coords.lat, coords.lng, targetCoord[1], targetCoord[0])
    : null;

  const bearingToTarget = coords && targetCoord
    ? getBearing(coords.lat, coords.lng, targetCoord[1], targetCoord[0])
    : null;

  // Remaining walk time using current distance vs original leg distance
  const remainingWalkSec = distToTarget !== null && leg.distanceM > 0
    ? (distToTarget / leg.distanceM) * leg.durationSec
    : leg.durationSec;

  // ── Transit: walking to bus stop ──────────────────────────────────────────
  if (isTransitRoute && leg.mode === "WALK" && nextLeg?.mode === "TRANSIT") {
    const waitMins = nextLeg.waitSec ? Math.round(nextLeg.waitSec / 60) : null;
    return (
      <div className="bg-black/85 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3.5 w-52 shadow-2xl space-y-2.5">
        {/* Line + headsign + wait */}
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
            style={{ background: lineColor(nextLeg.line ?? ""), color: "#000" }}
          >
            {nextLeg.line}
          </span>
          <span className="text-white text-sm font-semibold truncate">
            → {nextLeg.headsign}
          </span>
          {waitMins !== null && (
            <span className="text-white/50 text-xs shrink-0">• {waitMins}m</span>
          )}
        </div>

        {/* Walk to stop */}
        <div className="flex items-center gap-2 text-white/70 text-xs">
          {bearingToTarget !== null && (
            <DirectionArrow bearing={bearingToTarget} heading={coords?.heading ?? null} />
          )}
          <span>
            {formatMins(remainingWalkSec)} walk
          </span>
          {nextLeg.boardStopName && (
            <span className="text-white/40 truncate">· {nextLeg.boardStopName}</span>
          )}
        </div>

        {/* Divider + destination + arrival */}
        <div className="border-t border-white/10 pt-2 flex items-center justify-between">
          <span className="text-white/40 text-[10px] truncate max-w-[120px]">
            {destination.name.split(",")[0]}
          </span>
          <span className="text-white/60 text-[10px] tabular-nums shrink-0">
            {formatTime(destination.arrivalTime)}
          </span>
        </div>
      </div>
    );
  }

  // ── Transit: on the bus ───────────────────────────────────────────────────
  if (isTransitRoute && leg.mode === "TRANSIT") {
    return (
      <div className="bg-black/85 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3.5 w-52 shadow-2xl space-y-2.5">
        {/* Line + headsign */}
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
            style={{ background: lineColor(leg.line ?? ""), color: "#000" }}
          >
            {leg.line}
          </span>
          <span className="text-white text-sm font-semibold truncate">
            → {leg.headsign}
          </span>
        </div>

        {/* Ride info */}
        <div className="text-white/70 text-xs">
          On bus · {formatMins(leg.durationSec)} ride
        </div>
        {leg.alightStopName && (
          <div className="text-white/40 text-[10px]">
            Exit at {leg.alightStopName}
          </div>
        )}

        {/* Destination + arrival */}
        <div className="border-t border-white/10 pt-2 flex items-center justify-between">
          <span className="text-white/40 text-[10px] truncate max-w-[120px]">
            {destination.name.split(",")[0]}
          </span>
          <span className="text-white/60 text-[10px] tabular-nums shrink-0">
            {formatTime(destination.arrivalTime)}
          </span>
        </div>
      </div>
    );
  }

  // ── Final walk (transit last leg or walk-only route) ──────────────────────
  const steps = leg.steps ?? [];
  const currentStep = steps.find((s) => s.maneuverType !== "depart") ?? steps[0];
  const isArrive = distToTarget !== null && distToTarget < 30;

  return (
    <div className="bg-black/85 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3.5 w-52 shadow-2xl space-y-2.5">
      {/* Direction + distance */}
      <div className="flex items-center gap-2">
        {bearingToTarget !== null && (
          <DirectionArrow bearing={bearingToTarget} heading={coords?.heading ?? null} />
        )}
        <span className="text-white text-sm font-semibold">
          {isArrive
            ? "You have arrived"
            : distToTarget !== null
            ? formatDist(distToTarget)
            : formatDist(leg.distanceM)}
        </span>
      </div>

      {/* Street or instruction */}
      {!isArrive && currentStep && (
        <div className="text-white/60 text-xs leading-snug">
          {currentStep.streetName
            ? <>onto <span className="text-white/90 font-medium">{currentStep.streetName}</span></>
            : currentStep.instruction}
        </div>
      )}

      {/* Destination + arrival */}
      <div className="border-t border-white/10 pt-2 flex items-center justify-between">
        <span className="text-white/40 text-[10px] truncate max-w-[120px]">
          {destination.name.split(",")[0]}
        </span>
        <span className="text-white/60 text-[10px] tabular-nums shrink-0">
          {formatTime(destination.arrivalTime)}
        </span>
      </div>
    </div>
  );
}
