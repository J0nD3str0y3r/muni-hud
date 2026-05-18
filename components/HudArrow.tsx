"use client";

import type { Coords } from "@/app/page";
import type { Destination } from "@/components/SearchBar";

type Props = {
  coords: Coords;
  destination: Destination;
};

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

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HudArrow({ coords, destination }: Props) {
  const targetBearing = getBearing(coords.lat, coords.lng, destination.lat, destination.lng);
  const hasHeading = coords.heading !== null && coords.speed !== null && coords.speed > 0.5;
  const bearing = hasHeading
    ? (targetBearing - coords.heading! + 360) % 360
    : targetBearing;

  const distM = haversineM(coords.lat, coords.lng, destination.lat, destination.lng);
  const label = destination.name.split(",")[0];

  return (
    <>
      {/* Central arrow */}
      <div
        className="fixed inset-0 flex items-center justify-center pointer-events-none z-[9999]"
      >
        <div
          style={{
            fontSize: 140,
            lineHeight: 1,
            opacity: 0.72,
            color: "#ffffff",
            textShadow: "0 0 40px rgba(255,255,255,0.6), 0 0 80px rgba(79,156,255,0.4)",
            transform: `rotate(${bearing}deg)`,
            transition: "transform 0.4s ease",
            userSelect: "none",
          }}
        >
          ▲
        </div>
      </div>

      {/* Distance + label */}
      <div
        className="fixed left-0 right-0 pointer-events-none z-[9999] text-center"
        style={{ bottom: "12vh" }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.9)",
            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          {formatDist(distM)}
        </div>
        <div
          style={{
            fontSize: 14,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.45)",
            marginTop: 4,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
    </>
  );
}
