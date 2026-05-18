"use client";

import { useMemo } from "react";
import type { RouteOption, RouteStep } from "@/app/api/tripplan/route";
import type { Coords } from "@/app/page";

type Props = {
  route: RouteOption;
  coords: Coords | null;
};

// Haversine in meters
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
  if (m < 1609) return `${Math.round(m / 100) * 100}m`;
  return `${(m / 1609.34).toFixed(1)}mi`;
}

// Maps maneuver modifier → SVG arrow rotation in degrees
// 0 = straight up (ahead), positive = clockwise
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

function ArrowIcon({ type, modifier }: { type: string; modifier: string }) {
  const isArrive = type === "arrive";
  const angle = isArrive ? 0 : (MODIFIER_ANGLE[modifier] ?? 0);

  if (isArrive) {
    // Destination pin
    return (
      <svg viewBox="0 0 24 24" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="10" r="4" fill="currentColor" stroke="none" />
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="w-12 h-12"
      fill="currentColor"
      style={{ transform: `rotate(${angle}deg)`, transition: "transform 0.3s ease" }}
    >
      {/* Straight arrow shaft + arrowhead pointing up */}
      <path d="M12 3l-4 6h2.5v9h3V9H16L12 3z" />
    </svg>
  );
}

export default function TurnPanel({ route, coords }: Props) {
  const steps = route.legs.flatMap((l) => l.steps);

  const { nextStep, distToStep } = useMemo(() => {
    if (!coords || steps.length === 0) {
      return { nextStep: steps[0] ?? null, distToStep: 0 };
    }

    // Find the first step whose maneuver point we haven't passed yet.
    // "Not yet passed" = we're still more than 15m away from it,
    // or it's the last step (arrive).
    const PASSED_THRESHOLD = 15;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as RouteStep;
      if (!step.location) continue;
      const d = distM(coords.lat, coords.lng, step.location[1], step.location[0]);
      if (d > PASSED_THRESHOLD || i === steps.length - 1) {
        return { nextStep: step, distToStep: Math.round(d) };
      }
    }

    return { nextStep: steps[steps.length - 1], distToStep: 0 };
  }, [coords, steps]);

  if (!nextStep) return null;

  const isArrive = nextStep.maneuverType === "arrive";

  return (
    <div className="bg-black/70 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-col items-center gap-2 min-w-[110px] max-w-[130px]">
      {/* Arrow */}
      <div className="text-white">
        <ArrowIcon type={nextStep.maneuverType} modifier={nextStep.maneuverModifier} />
      </div>

      {/* Distance to maneuver */}
      {!isArrive && (
        <div className="text-white text-lg font-bold tabular-nums leading-none">
          {formatDist(distToStep)}
        </div>
      )}

      {/* Street name */}
      <div className="text-white/60 text-[10px] text-center leading-tight max-w-full">
        {isArrive
          ? "You have arrived"
          : nextStep.streetName
          ? `onto ${nextStep.streetName}`
          : nextStep.instruction}
      </div>
    </div>
  );
}
