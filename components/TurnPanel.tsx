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
  const steps = route.legs.flatMap((l) => l.steps) as RouteStep[];

  // Cumulative distance at the END of each step — tells us when to advance
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

  // Reset everything when route changes
  useEffect(() => {
    stepIdxRef.current = 0;
    setStepIdx(0);
    prevCoordsRef.current = null;
    distTraveledRef.current = 0;
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accumulate distance traveled and advance step index accordingly
  useEffect(() => {
    if (!coords) return;

    if (prevCoordsRef.current) {
      const d = distM(
        prevCoordsRef.current.lat, prevCoordsRef.current.lng,
        coords.lat, coords.lng
      );
      distTraveledRef.current += d;
    }
    prevCoordsRef.current = coords;

    const traveled = distTraveledRef.current;

    // Find the first step whose cumulative end-distance is still AHEAD of us
    const next = cumDist.findIndex((end) => end > traveled);
    const newIdx = next >= 0 ? next : steps.length - 1;

    if (newIdx !== stepIdxRef.current) {
      stepIdxRef.current = newIdx;
      setStepIdx(newIdx);
    }
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps[stepIdx];
  if (!step) return null;

  const isArrive = step.maneuverType === "arrive";

  // Remaining distance to this step's maneuver point (for display)
  const distToStep = coords && step.location
    ? Math.round(distM(coords.lat, coords.lng, step.location[1], step.location[0]))
    : null;

  return (
    <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-4 flex flex-col items-center gap-3 w-36 shadow-2xl">
      <ArrowIcon type={step.maneuverType} modifier={step.maneuverModifier} />

      {!isArrive && distToStep !== null && (
        <div className="text-white text-2xl font-bold tabular-nums leading-none tracking-tight">
          {formatDist(distToStep)}
        </div>
      )}

      <div className="text-white/70 text-xs text-center leading-snug">
        {isArrive ? (
          "You have arrived"
        ) : step.streetName ? (
          <>onto<br /><span className="text-white font-semibold">{step.streetName}</span></>
        ) : (
          step.instruction
        )}
      </div>
    </div>
  );
}
