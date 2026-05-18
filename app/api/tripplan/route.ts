import { NextRequest, NextResponse } from "next/server";

// Uses Mapbox Directions API — same token already in use, no extra signup needed.
// Profiles: walking | cycling | driving
// Returns a single RouteOption with geometry ready to draw on the map.

export type RouteLeg = {
  mode: "WALK" | "CYCLING" | "TRANSIT";
  durationSec: number;
  distanceM: number;
  departureTime: number;
  geometry: [number, number][];
  steps: RouteStep[];
};

export type RouteStep = {
  instruction: string;
  distanceM: number;
  durationSec: number;
  maneuverType: string;     // "turn" | "depart" | "arrive" | "continue" | "roundabout" etc.
  maneuverModifier: string; // "left" | "right" | "straight" | "slight left" etc.
  streetName: string;       // name of street to turn onto
  location: [number, number]; // [lng, lat] of the maneuver point
};

export type RouteOption = {
  id: string;
  profile: "walking" | "cycling";
  totalDurationSec: number;
  totalDistanceM: number;
  departureTime: number;
  arrivalTime: number;
  legs: RouteLeg[];
};

// MAPBOX_SECRET_TOKEN is a sk. token with DIRECTIONS:READ scope (server-side only)
// Falls back to the public token during local dev if you haven't set up the secret yet
const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export async function GET(req: NextRequest) {
  if (!MAPBOX_TOKEN) {
    return NextResponse.json({ error: "Mapbox token not configured" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const olat = searchParams.get("olat");
  const olng = searchParams.get("olng");
  const dlat = searchParams.get("dlat");
  const dlng = searchParams.get("dlng");

  if (!olat || !olng || !dlat || !dlng) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  // Fetch both walking and cycling in parallel
  const [walkRes, bikeRes] = await Promise.all([
    fetchDirections(olng, olat, dlng, dlat, "walking"),
    fetchDirections(olng, olat, dlng, dlat, "cycling"),
  ]);

  const routes: RouteOption[] = [];
  const now = Date.now();

  for (const [profile, data] of [["walking", walkRes], ["cycling", bikeRes]] as const) {
    const route = data?.routes?.[0];
    if (!route) continue;

    const durationSec = Math.round(route.duration);
    const distanceM = Math.round(route.distance);
    const geometry: [number, number][] = route.geometry.coordinates;

    const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s: {
      maneuver: { instruction: string; type: string; modifier?: string; location: [number, number] };
      name: string;
      distance: number;
      duration: number;
    }) => ({
      instruction: s.maneuver.instruction,
      distanceM: Math.round(s.distance),
      durationSec: Math.round(s.duration),
      maneuverType: s.maneuver.type ?? "continue",
      maneuverModifier: s.maneuver.modifier ?? "straight",
      streetName: s.name ?? "",
      location: s.maneuver.location,
    }));

    routes.push({
      id: profile,
      profile,
      totalDurationSec: durationSec,
      totalDistanceM: distanceM,
      departureTime: now,
      arrivalTime: now + durationSec * 1000,
      legs: [{
        mode: profile === "cycling" ? "CYCLING" : "WALK",
        durationSec,
        distanceM,
        departureTime: now,
        geometry,
        steps,
      }],
    });
  }

  if (routes.length === 0) {
    return NextResponse.json({ error: "No routes found" }, { status: 404 });
  }

  return NextResponse.json(routes);
}

async function fetchDirections(
  olng: string, olat: string,
  dlng: string, dlat: string,
  profile: "walking" | "cycling"
) {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${olng},${olat};${dlng},${dlat}` +
    `?access_token=${MAPBOX_TOKEN}&geometries=geojson&steps=true&overview=full`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[tripplan] Mapbox ${profile} returned ${res.status}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.error(`[tripplan] fetch ${profile} failed:`, e);
    return null;
  }
}
