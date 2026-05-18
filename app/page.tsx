"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import EtaPanel, { type StopPin } from "@/components/EtaPanel";
import SearchBar, { type Destination } from "@/components/SearchBar";
import RoutePanel from "@/components/RoutePanel";
import NavPanel from "@/components/NavPanel";
import TurnPanel from "@/components/TurnPanel";
import type { RouteOption } from "@/app/api/tripplan/route";

// mapbox-gl uses browser-only APIs — never SSR
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

export type Coords = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
};

type LocationState = "idle" | "waiting" | "active" | "denied" | "unavailable";

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locState, setLocState] = useState<LocationState>("idle");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteOption | null>(null);
  const [stopPin, setStopPin] = useState<StopPin | null>(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) { setLocState("unavailable"); return; }
    setLocState("waiting");

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocState("active");
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocState("denied");
        else setLocState("unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  function handleClearDestination() {
    setDestination(null);
    setActiveRoute(null);
  }

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
          In your browser settings, set Location to{" "}
          <strong className="text-white/50">Allow</strong> for this site, then tap to retry.
        </p>
      </main>
    );
  }

  if (locState === "unavailable") {
    return (
      <main className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-white/60 text-sm">Location unavailable</div>
        <p className="text-white/30 text-xs max-w-xs">
          GPS timed out or geolocation is not supported on this device.
        </p>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen bg-black">
      <Map coords={coords} route={activeRoute} stopPin={stopPin} />

      {/* Search bar — full width at top */}
      <div className="absolute top-4 left-4 right-4 z-10">
        <SearchBar
          userCoords={coords}
          onSelect={setDestination}
          onClear={handleClearDestination}
          hasDestination={!!destination}
        />
      </div>

      {/* Route options — below search */}
      {destination && coords && (
        <div className="absolute top-16 left-4 right-4 z-10">
          <RoutePanel
            userCoords={coords}
            destination={destination}
            onSelectRoute={(r) => setActiveRoute(r)}
            onCancel={handleClearDestination}
            activeRoute={activeRoute}
          />
        </div>
      )}

      {/* ETA panel — bottom left, always visible */}
      <div className="absolute bottom-6 left-4 z-10">
        <EtaPanel coords={coords} onStopPin={setStopPin} />
      </div>

      {/* Turn-by-turn card — top right, only while navigating */}
      {activeRoute && (
        <div className="absolute top-4 right-4 z-10">
          <TurnPanel route={activeRoute} coords={coords} />
        </div>
      )}

      {/* Nav summary panel — right side middle, only while navigating */}
      {activeRoute && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10">
          <NavPanel route={activeRoute} coords={coords} />
        </div>
      )}

      {/* Clock — bottom center, hidden while navigating */}
      {!activeRoute && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <Clock />
        </div>
      )}
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

  return <span className="text-white/60 text-sm tracking-widest tabular-nums">{time}</span>;
}
