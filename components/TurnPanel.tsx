"use client";

import { useMemo } from "react";
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
  if (m < 100) return `${Math.round(m)} m`;
  if (m < 1609) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

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
  if (type === "arrive") {
    return (
      <svg viewBox="0 0 24 24" className="w-16 h-16 text-white" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    );
  }

  const angle = MODIFIER_ANGLE[modifier] ?? 0;
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-16 h-16 text-white"
      fill="currentColor"
      style={{ transform: `rotate(${angle}deg)`, transition: "transform 0.4s ease" }}
    >
      <path d="M12 2l-5 7.5h3V19h4V9.5h3L12 2z" />
    </svg>
  );
}

export default function TurnPanel({ route, coords }: Props) {
  const steps = route.legs.flatMap((l) => l.steps);

  const { nextStep, distToStep } = useMemo(() => {
    if (!coords || steps.length === 0) {
      return { nextStep: steps[0] ?? null, distToStep: null };
    }
    const PASSED = 15;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as RouteStep;
      if (!step.location) continue;
      const d = distM(coords.lat, coords.lng, step.location[1], step.location[0]);
      if (d > PASSED || i === steps.length - 1) {
        return { nextStep: step, distToStep: Math.round(d) };
      }
    }
    return { nextStep: steps[steps.length - 1], distToStep: 0 };
  }, [coords, steps]);

  if (!nextStep) return null;

  const isArrive = nextStep.maneuverType === "arrive";
  const isDepart = nextStep.maneuverType === "depart";

  return (
    <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-4 flex flex-col items-center gap-3 w-36 shadow-2xl">
      {/* Big arrow */}
      <ArrowIcon type={nextStep.maneuverType} modifier={nextStep.maneuverModifier} />

      {/* Distance to maneuver — large and prominent */}
      {!isArrive && !isDepart && distToStep !== null && (
        <div className="text-white text-2xl font-bold tabular-nums leading-none tracking-tight">
          {formatDist(distToStep)}
        </div>
      )}

      {/* Street name */}
      <div className="text-white/70 text-xs text-center leading-snug">
        {isArrive
          ? "You have arrived"
          : isDepart
          ? "Head out"
          : nextStep.streetName
          ? <>onto<br /><span className="text-white font-semibold">{nextStep.streetName}</span></>
          : nextStep.instruction}
      </div>
    </div>
  );
}
