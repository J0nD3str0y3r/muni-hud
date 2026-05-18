"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { RouteOption, RouteStep } from "@/app/api/tripplan/route";
import type { Coords } from "@/app/page";

type Props = {
  route: RouteOption;
  coords: Coords | null;
};

function distM(lat1: number, lng1: number, lat2: number, lng2: number) {
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

function formatDist(m: number) {
  if (m < 100) return `${Math.round(m)}m`;
  if (m < 1609) return `${Math.round(m / 25) * 25}m`;
  return `${(m / 1609.34).toFixed(1)}mi`;
}

// Human action word from maneuver type + modifier
function actionWord(type: string, modifier: string): string {
  if (type === "arrive") return "Arrive";
  if (type === "depart") return "Head out";
  if (type === "roundabout" || type === "rotary") return "Enter roundabout";
  if (type === "merge") return modifier.includes("left") ? "Merge left" : "Merge right";
  if (type === "fork") return modifier.includes("left") ? "Keep left" : "Keep right";
  if (type === "off ramp") return modifier.includes("left") ? "Exit left" : "Exit right";
  if (type === "end of road") return modifier.includes("left") ? "Turn left" : "Turn right";

  switch (modifier) {
    case "left":        return "Left";
    case "right":       return "Right";
    case "slight left": return "Bear left";
    case "slight right":return "Bear right";
    case "sharp left":  return "Sharp left";
    case "sharp right": return "Sharp right";
    case "uturn":       return "U-turn";
    default:            return "Straight";
  }
}

// SVG arrow rotated by maneuver modifier
const MODIFIER_ANGLE: Record<string, number> = {
  straight: 0,
  "slight right": 30,
  right: 90,
  "sharp right": 135,
  uturn: 180,
  "sharp left": -135,
  left: -90,
  "slight left": -30,
};

function ManeuverArrow({ type, modifier }: { type: string; modifier: string }) {
  if (type === "arrive") {
    return (
      <svg viewBox="0 0 24 24" className="w-14 h-14 text-white" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    );
  }
  const angle = MODIFIER_ANGLE[modifier] ?? 0;
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-14 h-14 text-white"
      fill="currentColor"
      style={{ transform: `rotate(${angle}deg)`, transition: "transform 0.4s ease" }}
    >
      <path d="M12 2l-5 7.5h3V19h4V9.5h3L12 2z" />
    </svg>
  );
}

function getBearing(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function BearingArrow({ bearing, heading }: { bearing: number; heading: number | null }) {
  const angle = heading !== null ? (bearing - heading + 360) % 360 : bearing;
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-14 h-14 text-white"
      fill="currentColor"
      style={{ transform: `rotate(${angle}deg)`, transition: "transform 0.4s ease" }}
    >
      <path d="M12 2l-5 7.5h3V19h4V9.5h3L12 2z" />
    </svg>
  );
}

export default function TurnPanel({ route, coords }: Props) {
  const steps = route.legs.flatMap((l) => l.steps) as RouteStep[];

  const cumDist = useMemo(() => {
    let total = 0;
    return steps.map((s) => {
      total += s.distanceM;
      return total;
    });
  }, [steps]);

  const [stepIdx, setStepIdx] = useState(0);
  const stepIdxRef = useRef(0);
  const prevCoordsRef = useRef<Coords | null>(null);
  const distTraveledRef = useRef(0);

  useEffect(() => {
    stepIdxRef.current = 0;
    setStepIdx(0);
    prevCoordsRef.current = null;
    distTraveledRef.current = 0;
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!coords) return;
    if (prevCoordsRef.current) {
      distTraveledRef.current += distM(
        prevCoordsRef.current.lat, prevCoordsRef.current.lng,
        coords.lat, coords.lng
      );
    }
    prevCoordsRef.current = coords;

    const next = cumDist.findIndex((end) => end > distTraveledRef.current);
    const newIdx = next >= 0 ? next : steps.length - 1;
    if (newIdx !== stepIdxRef.current) {
      stepIdxRef.current = newIdx;
      setStepIdx(newIdx);
    }
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transit routes have no steps — bearing arrow to destination
  if (steps.length === 0) {
    const destCoord = route.legs[route.legs.length - 1]?.geometry.at(-1);
    if (!destCoord || !coords) return null;
    const bearing = getBearing(coords.lat, coords.lng, destCoord[1], destCoord[0]);
    const dist = distM(coords.lat, coords.lng, destCoord[1], destCoord[0]);
    return (
      <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-4 flex flex-col items-center gap-2 w-40 shadow-2xl">
        <BearingArrow bearing={bearing} heading={coords.heading} />
        <div className="text-white text-xl font-bold tabular-nums">{formatDist(dist)}</div>
      </div>
    );
  }

  const rawStep = steps[stepIdx];
  if (!rawStep) return null;

  const step = rawStep.maneuverType === "depart" && steps[stepIdx + 1]
    ? steps[stepIdx + 1]
    : rawStep;

  const isArrive = step.maneuverType === "arrive";
  const action = actionWord(step.maneuverType, step.maneuverModifier);

  const distToStep = coords && step.location
    ? distM(coords.lat, coords.lng, step.location[1], step.location[0])
    : null;

  // Street name — strip "St", "Ave" etc only if very long; otherwise keep it
  const street = step.streetName ?? "";

  return (
    <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-4 flex flex-col items-center gap-2 w-40 shadow-2xl">
      <ManeuverArrow type={step.maneuverType} modifier={step.maneuverModifier} />

      {isArrive ? (
        <div className="text-white text-base font-semibold text-center">You&apos;re here</div>
      ) : (
        <>
          {/* Action + distance on one line */}
          <div className="text-white text-base font-bold text-center leading-tight">
            {distToStep !== null
              ? `${action} in ${formatDist(distToStep)}`
              : action}
          </div>

          {/* Street name */}
          {street && (
            <div className="text-white/60 text-xs text-center leading-snug font-medium tracking-wide">
              {street}
            </div>
          )}
        </>
      )}
    </div>
  );
}
