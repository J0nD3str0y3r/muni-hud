"use client";

import { useEffect, useState } from "react";
import type { Coords } from "@/app/page";
import type { Destination } from "./SearchBar";
import type { RouteOption } from "@/app/api/tripplan/route";

type Props = {
  userCoords: Coords;
  destination: Destination;
  onSelectRoute: (route: RouteOption) => void;
  onCancel: () => void;
  activeRoute: RouteOption | null;
};

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function LegPills({ legs }: { legs: RouteOption["legs"] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {legs.map((leg, i) => (
        <span key={i} className={[
          "text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide",
          leg.mode === "WALK"
            ? "text-white/40 bg-white/5"
            : "text-blue-300 bg-blue-900/60",
        ].join(" ")}>
          {leg.mode === "WALK" ? "walk" : (leg.line ?? leg.mode)}
        </span>
      ))}
    </div>
  );
}

export default function RoutePanel({
  userCoords,
  destination,
  onSelectRoute,
  onCancel,
  activeRoute,
}: Props) {
  const [options, setOptions] = useState<RouteOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setOptions(null);

    fetch(
      `/api/tripplan?olat=${userCoords.lat}&olng=${userCoords.lng}` +
      `&dlat=${destination.lat}&dlng=${destination.lng}`
    )
      .then((r) => r.json())
      .then((data: RouteOption[]) => {
        if (!Array.isArray(data) || data.length === 0) throw new Error();
        setOptions(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.lat, destination.lng]);

  // Active route — compact strip
  if (activeRoute) {
    const nextTransit = activeRoute.legs.find((l) => l.mode === "TRANSIT");
    return (
      <div className="flex items-center gap-3 bg-black/70 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-white text-xs font-semibold truncate">{destination.name.split(",")[0]}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <LegPills legs={activeRoute.legs} />
            <span className="text-white/40 text-[10px]">
              arr {formatTime(activeRoute.arrivalTime)}
            </span>
          </div>
          {nextTransit && (
            <div className="text-white/50 text-[10px] mt-0.5">
              {nextTransit.line ?? nextTransit.mode} departs {formatTime(nextTransit.departureTime)}
            </div>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-white/40 hover:text-white/80 transition-colors shrink-0 ml-2"
          aria-label="Cancel navigation"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-black/70 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
        <span className="text-white/60 text-[11px] truncate max-w-[200px]">
          To: {destination.name.split(",")[0]}
        </span>
        <button onClick={onCancel} className="text-white/40 hover:text-white/80 transition-colors ml-2 shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {loading && (
        <div className="px-4 py-4 text-white/30 text-xs">Finding MUNI options…</div>
      )}

      {error && (
        <div className="px-4 py-4 text-white/40 text-xs">
          Couldn't load routes. Check your 511 API key or try again.
        </div>
      )}

      {options && options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelectRoute(opt)}
          className="w-full text-left px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-white text-sm font-semibold">{formatDuration(opt.totalDurationSec)}</span>
            <span className="text-white/40 text-[10px]">arr {formatTime(opt.arrivalTime)}</span>
          </div>
          <div className="mt-1">
            <LegPills legs={opt.legs} />
          </div>
          <div className="text-white/30 text-[10px] mt-0.5">
            departs {formatTime(opt.departureTime)}
          </div>
        </button>
      ))}
    </div>
  );
}
