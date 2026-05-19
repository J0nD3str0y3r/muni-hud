"use client";

import { useEffect, useState } from "react";
import type { Coords } from "@/app/page";
import type { Destination } from "./SearchBar";
import type { RouteOption, RouteLeg } from "@/app/api/tripplan/route";
import { lineColor } from "@/lib/lineColor";

function legBg(leg: RouteLeg): string {
  return leg.lineColorHex ?? lineColor(leg.line ?? "");
}

function legFg(leg: RouteLeg): string {
  const hex = leg.lineColorHex;
  if (!hex) return "#000";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 140 ? "#ffffff" : "#000000";
}

type Props = {
  userCoords: Coords;
  destination: Destination;
  onSelectRoute: (route: RouteOption) => void;
  onCancel: () => void;
  activeRoute: RouteOption | null;
  onRoutesLoaded?: (routes: RouteOption[]) => void;
};

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatDistance(m: number) {
  return m < 1000 ? `${m}m` : `${(m / 1609).toFixed(1)}mi`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const PROFILE_LABEL: Record<string, string> = {
  walking: "Walk",
  cycling: "Bike",
  transit: "Transit",
};

const PROFILE_ICON: Record<string, string> = {
  walking: "🚶",
  cycling: "🚲",
  transit: "🚌",
};

export default function RoutePanel({
  userCoords,
  destination,
  onSelectRoute,
  onCancel,
  activeRoute,
  onRoutesLoaded,
}: Props) {
  const [options, setOptions] = useState<RouteOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setOptions(null);

    fetch(
      `/api/tripplan?olat=${userCoords.lat}&olng=${userCoords.lng}` +
      `&dlat=${destination.lat}&dlng=${destination.lng}`
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);
        if (!Array.isArray(data) || data.length === 0)
          throw new Error("No routes found");
        setOptions(data);
        onRoutesLoaded?.(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.lat, destination.lng]);

  // Active route — compact strip with live stats
  if (activeRoute) {
    const remainingM = userCoords
      ? (() => {
          const lastLeg = activeRoute.legs[activeRoute.legs.length - 1];
          const dest = lastLeg?.geometry[lastLeg.geometry.length - 1];
          if (!dest) return activeRoute.totalDistanceM;
          const R = 6_371_000;
          const dLat = ((dest[1] - userCoords.lat) * Math.PI) / 180;
          const dLng = ((dest[0] - userCoords.lng) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((userCoords.lat * Math.PI) / 180) *
            Math.cos((dest[1] * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        })()
      : activeRoute.totalDistanceM;

    const pace = activeRoute.totalDurationSec / Math.max(activeRoute.totalDistanceM, 1);
    const remainingMins = Math.max(0, Math.round((remainingM * pace) / 60));
    const arrivalMs = Date.now() + remainingM * pace * 1000;

    return (
      <div className="bg-black/70 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <span className="text-base shrink-0">{PROFILE_ICON[activeRoute.profile] ?? "🗺️"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-white text-xs font-semibold truncate">
            {destination.name.split(",")[0]}
          </div>
          <div className="text-white/40 text-[10px] tabular-nums">
            {remainingMins} min · {formatDistance(remainingM)} · arr {formatTime(arrivalMs)}
          </div>
        </div>
        <button onClick={onCancel} className="text-white/40 hover:text-white/80 shrink-0" aria-label="Cancel">
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
        <span className="text-white/60 text-[11px] truncate max-w-[220px]">
          To: {destination.name.split(",")[0]}
        </span>
        <button onClick={onCancel} className="text-white/40 hover:text-white/80 transition-colors ml-2 shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {loading && (
        <div className="px-4 py-4 text-white/30 text-xs">Getting directions…</div>
      )}

      {error && (
        <div className="px-4 py-4 text-white/40 text-xs space-y-1">
          <div>Couldn't load routes.</div>
          <div className="text-white/25 break-all">{error}</div>
        </div>
      )}

      {options?.map((opt) => (
        <div key={opt.id} className="border-b border-white/5 last:border-0">
          <button
            onClick={() => onSelectRoute(opt)}
            className="w-full text-left px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{PROFILE_ICON[opt.profile]}</span>
                <div>
                  <span className="text-white text-sm font-semibold">{formatDuration(opt.totalDurationSec)}</span>
                  <span className="text-white/40 text-[10px] ml-2">{PROFILE_LABEL[opt.profile]}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white/40 text-[10px]">{formatDistance(opt.totalDistanceM)}</div>
                <div className="text-white/30 text-[10px]">arr {formatTime(opt.arrivalTime)}</div>
              </div>
            </div>

            {/* Multi-modal leg pills for transit */}
            {opt.profile === "transit" && (
              <div className="flex items-center gap-1 flex-wrap">
                {opt.legs.map((leg, i) => {
                  if (leg.mode === "WALK") {
                    return (
                      <span key={i} className="text-white/50 text-[10px] flex items-center gap-0.5">
                        🚶 {formatDuration(leg.durationSec)}
                      </span>
                    );
                  }
                  if (leg.mode === "TRANSIT") {
                    return (
                      <span key={i} className="flex items-center gap-1">
                        <span className="text-white/30 text-[9px]">→</span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: legBg(leg), color: legFg(leg) }}
                        >
                          {leg.line}
                        </span>
                        {leg.headsign && (
                          <span className="text-white/40 text-[10px] truncate max-w-[80px]">
                            {leg.headsign}
                          </span>
                        )}
                        {leg.waitSec !== undefined && leg.waitSec > 0 && (
                          <span className="text-white/30 text-[9px]">
                            ({Math.round(leg.waitSec / 60)}m wait)
                          </span>
                        )}
                        <span className="text-white/30 text-[9px]">→</span>
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Board/alight stop names */}
            {opt.profile === "transit" && (() => {
              const transitLeg = opt.legs.find(l => l.mode === "TRANSIT");
              if (!transitLeg) return null;
              return (
                <div className="text-white/30 text-[9px] mt-1 truncate">
                  {transitLeg.boardStopName} → {transitLeg.alightStopName}
                </div>
              );
            })()}
          </button>

          {/* Step preview toggle (walk/bike only) */}
          {opt.profile !== "transit" && opt.legs[0]?.steps?.length > 0 && (
            <button
              onClick={() => setExpandedStep(expandedStep === opt.id ? null : opt.id)}
              className="w-full px-4 pb-2 text-left text-white/25 text-[10px] hover:text-white/40 transition-colors"
            >
              {expandedStep === opt.id ? "▲ hide steps" : `▼ ${opt.legs[0].steps.length} steps`}
            </button>
          )}
          {expandedStep === opt.id && (
            <div className="px-4 pb-3 space-y-1.5 max-h-40 overflow-y-auto">
              {opt.legs[0].steps.map((step, i) => (
                <div key={i} className="flex gap-2 text-[10px]">
                  <span className="text-white/20 tabular-nums shrink-0">{formatDistance(step.distanceM)}</span>
                  <span className="text-white/50">{step.instruction}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
