"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import EtaPanel from "@/components/EtaPanel";

// mapbox-gl uses browser-only APIs — never SSR
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

export type Coords = { lat: number; lng: number };

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError("Location access denied"),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return (
    <main className="relative w-screen h-screen bg-black">
      {/* Full-screen dark map */}
      <Map coords={coords} />

      {/* HUD overlay — top-left ETA panel */}
      <div className="absolute top-4 left-4 z-10">
        <EtaPanel coords={coords} />
      </div>

      {/* Clock + heading — bottom center */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-center">
        <Clock />
      </div>

      {locationError && (
        <div className="absolute bottom-6 right-4 z-10 text-red-400 text-xs">
          {locationError}
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

  return (
    <span className="text-white/60 text-sm tracking-widest tabular-nums">{time}</span>
  );
}
