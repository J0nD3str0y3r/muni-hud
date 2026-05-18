"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import EtaPanel from "@/components/EtaPanel";

// mapbox-gl uses browser-only APIs — never SSR
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

export type Coords = { lat: number; lng: number };

type LocationState = "idle" | "waiting" | "active" | "denied" | "unavailable";

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locState, setLocState] = useState<LocationState>("idle");

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocState("unavailable");
      return;
    }
    setLocState("waiting");

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocState("active");
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocState("denied");
        else setLocState("unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Intentionally no auto-start — always require a tap so the browser
  // receives a user gesture before the permission prompt fires on mobile.

  if (locState === "idle" || locState === "waiting") {
    return (
      <main
        className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-6 cursor-pointer select-none"
        onClick={startTracking}
      >
        <div className="text-white/20 text-xs tracking-widest uppercase">MUNI HUD</div>
        <button className="text-white/60 text-sm border border-white/20 rounded-xl px-6 py-3 active:bg-white/10 transition-colors">
          {locState === "waiting" ? "Waiting for location…" : "Tap to enable location"}
        </button>
        {locState === "waiting" && (
          <p className="text-white/30 text-xs max-w-xs text-center">
            Allow location access when your browser asks.
          </p>
        )}
      </main>
    );
  }

  if (locState === "denied") {
    return (
      <main
        className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-4 px-8 text-center cursor-pointer"
        onClick={startTracking}
      >
        <div className="text-white/60 text-sm">Location access denied</div>
        <p className="text-white/30 text-xs max-w-xs">
          Your browser blocked location. In your browser settings, find this
          site and set Location to <strong className="text-white/50">Allow</strong>, then tap here to retry.
        </p>
      </main>
    );
  }

  if (locState === "unavailable") {
    return (
      <main className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-white/60 text-sm">Location unavailable</div>
        <p className="text-white/30 text-xs max-w-xs">
          GPS timed out or your device doesn't support geolocation.
        </p>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen bg-black">
      <Map coords={coords} />

      <div className="absolute top-4 left-4 z-10">
        <EtaPanel coords={coords} />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-center">
        <Clock />
      </div>
    </main>
  );
}

function Clock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="text-white/60 text-sm tracking-widest tabular-nums">{time}</span>
  );
}
