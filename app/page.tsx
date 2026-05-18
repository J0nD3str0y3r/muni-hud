"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import EtaPanel, { type StopPin } from "@/components/EtaPanel";
import SearchBar, { type Destination } from "@/components/SearchBar";
import RoutePanel from "@/components/RoutePanel";
import TurnPanel from "@/components/TurnPanel";
import TransitCard from "@/components/TransitCard";
import HudArrow from "@/components/HudArrow";
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

// Realistic bike route: 1188 Mission St → Pier 39
// Path: east on Mission → north on 4th → east on Market → north on Embarcadero → Pier 39
const SPOOF_ROUTE: [number, number][] = [
  [37.7762, -122.4133], // 1188 Mission St (start)
  [37.7761, -122.4115], // Mission & 7th
  [37.7760, -122.4095], // Mission & 6th
  [37.7758, -122.4073], // Mission & 5th
  [37.7758, -122.4057], // Mission & 4th — turn north
  [37.7775, -122.4055], // 4th St northbound
  [37.7795, -122.4053],
  [37.7815, -122.4051],
  [37.7835, -122.4050], // 4th & Market — turn east
  [37.7838, -122.4028], // Market St eastbound
  [37.7843, -122.4002],
  [37.7850, -122.3975],
  [37.7858, -122.3952],
  [37.7868, -122.3942],
  [37.7885, -122.3939],
  [37.7905, -122.3938],
  [37.7928, -122.3937],
  [37.7952, -122.3937], // Ferry Building / Embarcadero — turn north
  [37.7970, -122.3938], // Embarcadero northbound
  [37.7988, -122.3940],
  [37.8005, -122.3942],
  [37.8020, -122.3945],
  [37.8035, -122.3948],
  [37.8048, -122.3953],
  [37.8056, -122.3962],
  [37.8063, -122.3973],
  [37.8069, -122.3985],
  [37.8074, -122.3998],
  [37.8078, -122.4015],
  [37.8082, -122.4035],
  [37.8085, -122.4058],
  [37.8087, -122.4078],
  [37.8087, -122.4098], // Pier 39 (end)
];
const SPOOF_INTERVAL_MS = 1500; // step every 1.5 seconds

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locState, setLocState] = useState<LocationState>("idle");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteOption | null>(null);
  const [stopPin, setStopPin] = useState<StopPin | null>(null);
  const spoofIndexRef = useRef(0);

  // Check for ?spoof=1 in the URL
  const isSpoofMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("spoof") === "1";

  // Spoof mode — auto-starts, no permission needed
  useEffect(() => {
    if (!isSpoofMode) return;
    spoofIndexRef.current = 0;

    function applyIndex(i: number) {
      const [lat, lng] = SPOOF_ROUTE[i];
      const next = SPOOF_ROUTE[Math.min(i + 1, SPOOF_ROUTE.length - 1)];
      const heading = i < SPOOF_ROUTE.length - 1
        ? bearingDeg(lat, lng, next[0], next[1])
        : null;
      const dist = haversineM(lat, lng, next[0], next[1]);
      const speed = dist / (SPOOF_INTERVAL_MS / 1000); // m/s

      setCoords({ lat, lng, heading, speed, accuracy: 5 });
      setLocState("active");
    }

    applyIndex(0);

    const id = setInterval(() => {
      spoofIndexRef.current = Math.min(
        spoofIndexRef.current + 1,
        SPOOF_ROUTE.length - 1
      );
      applyIndex(spoofIndexRef.current);
      if (spoofIndexRef.current >= SPOOF_ROUTE.length - 1) clearInterval(id);
    }, SPOOF_INTERVAL_MS);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpoofMode]);

  const startTracking = useCallback(() => {
    if (isSpoofMode) return;
    if (!navigator.geolocation) { setLocState("unavailable"); return; }
    setLocState("waiting");

    const onPosition = (pos: GeolocationPosition) => {
      setLocState("active");
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        accuracy: pos.coords.accuracy,
      });
    };

    // Start with high accuracy. On timeout fall back to network-based location
    // so the app works on desktop and in poor GPS conditions.
    let id = navigator.geolocation.watchPosition(
      onPosition,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocState("denied");
          return;
        }
        // TIMEOUT or POSITION_UNAVAILABLE — retry without high accuracy
        navigator.geolocation.clearWatch(id);
        id = navigator.geolocation.watchPosition(
          onPosition,
          () => setLocState("unavailable"),
          { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 }
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [isSpoofMode]);

  function handleClearDestination() {
    setDestination(null);
    setActiveRoute(null);
  }

  if (!isSpoofMode && (locState === "idle" || locState === "waiting")) {
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
      <main
        className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-4 px-8 text-center cursor-pointer"
        onClick={startTracking}
      >
        <div className="text-white/60 text-sm">Couldn't get location</div>
        <p className="text-white/30 text-xs max-w-xs">
          Make sure location is enabled for this site in your browser settings, then tap to retry.
        </p>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen bg-black">
      <Map coords={coords} route={activeRoute} stopPin={stopPin} />

      {/* Spoof mode banner */}
      {isSpoofMode && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-500/80 text-black text-[10px] font-bold tracking-widest text-center py-1 uppercase">
          Spoof mode — fake bike route active
        </div>
      )}

      {/* HUD arrow — visible during active navigation */}
      {activeRoute && coords && destination && (
        <HudArrow coords={coords} destination={destination} />
      )}

      {activeRoute ? (
        /* ── NAVIGATION MODE ── */
        <>
          {/* Compact route strip — top left */}
          {destination && coords && (
            <div className="absolute top-4 left-4 right-4 z-10">
              <RoutePanel
                userCoords={coords}
                destination={destination}
                onSelectRoute={(r) => setActiveRoute(r)}
                onCancel={handleClearDestination}
                activeRoute={activeRoute}
              />
            </div>
          )}

          {/* Bottom right — transit info card + turn arrow stacked */}
          <div className="absolute bottom-6 right-4 z-10 flex flex-col items-end gap-2">
            <TransitCard
              route={activeRoute}
              coords={coords}
              destinationName={destination?.name ?? ""}
            />
            <TurnPanel route={activeRoute} coords={coords} />
          </div>
        </>
      ) : (
        /* ── BROWSE MODE ── */
        <>
          {/* Search bar — full width at top */}
          <div className="absolute top-4 left-4 right-4 z-10">
            <SearchBar
              userCoords={coords}
              onSelect={setDestination}
              onClear={handleClearDestination}
              hasDestination={!!destination}
            />
          </div>

          {/* Route options — right side, vertically centered */}
          {destination && coords && (
            <div className="absolute top-1/2 -translate-y-1/2 right-4 z-10 w-72">
              <RoutePanel
                userCoords={coords}
                destination={destination}
                onSelectRoute={(r) => setActiveRoute(r)}
                onCancel={handleClearDestination}
                activeRoute={activeRoute}
              />
            </div>
          )}
        </>
      )}

      {/* ETA panel — bottom left, always visible */}
      <div className="absolute bottom-6 left-4 z-10">
        <EtaPanel coords={coords} onStopPin={setStopPin} />
      </div>

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
