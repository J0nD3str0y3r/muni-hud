import { NextRequest, NextResponse } from "next/server";
import { decodePolyline } from "@/lib/polyline";

const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY!;

export type RouteStep = {
  instruction: string;
  distanceM: number;
  durationSec: number;
  maneuverType: string;
  maneuverModifier: string;
  streetName: string;
  location: [number, number];
};

export type RouteLeg = {
  mode: "WALK" | "CYCLING" | "TRANSIT";
  durationSec: number;
  distanceM: number;
  departureTime: number;
  geometry: [number, number][];
  steps: RouteStep[];
  // Transit-specific
  line?: string;
  headsign?: string;
  boardStopName?: string;
  alightStopName?: string;
  waitSec?: number;
};

export type RouteOption = {
  id: string;
  profile: "walking" | "cycling" | "transit";
  totalDurationSec: number;
  totalDistanceM: number;
  departureTime: number;
  arrivalTime: number;
  legs: RouteLeg[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Google Maps maneuver string → our type/modifier
function parseManeuver(gManeuver: string): { type: string; modifier: string } {
  if (!gManeuver) return { type: "continue", modifier: "straight" };
  const m = gManeuver.toLowerCase();
  if (m === "turn-left")          return { type: "turn", modifier: "left" };
  if (m === "turn-right")         return { type: "turn", modifier: "right" };
  if (m === "turn-sharp-left")    return { type: "turn", modifier: "sharp left" };
  if (m === "turn-sharp-right")   return { type: "turn", modifier: "sharp right" };
  if (m === "turn-slight-left")   return { type: "turn", modifier: "slight left" };
  if (m === "turn-slight-right")  return { type: "turn", modifier: "slight right" };
  if (m === "uturn-left" || m === "uturn-right") return { type: "turn", modifier: "uturn" };
  if (m === "roundabout-left")    return { type: "roundabout", modifier: "left" };
  if (m === "roundabout-right")   return { type: "roundabout", modifier: "right" };
  if (m === "merge")              return { type: "merge", modifier: "straight" };
  if (m === "fork-left")          return { type: "fork", modifier: "left" };
  if (m === "fork-right")         return { type: "fork", modifier: "right" };
  if (m === "ferry")              return { type: "continue", modifier: "straight" };
  if (m === "straight")           return { type: "continue", modifier: "straight" };
  return { type: "continue", modifier: "straight" };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// ─── Mapbox walking / cycling ─────────────────────────────────────────────────

async function fetchMapboxRoute(
  olng: string, olat: string, dlng: string, dlat: string,
  profile: "walking" | "cycling"
): Promise<RouteOption | null> {
  if (!MAPBOX_TOKEN) return null;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${olng},${olat};${dlng},${dlat}` +
    `?access_token=${MAPBOX_TOKEN}&geometries=geojson&steps=true&overview=full`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    const now = Date.now();
    const durationSec = Math.round(route.duration);
    const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s: {
      maneuver: { instruction: string; type: string; modifier?: string; location: [number, number] };
      name: string; distance: number; duration: number;
    }) => ({
      instruction: s.maneuver.instruction,
      distanceM: Math.round(s.distance),
      durationSec: Math.round(s.duration),
      maneuverType: s.maneuver.type ?? "continue",
      maneuverModifier: s.maneuver.modifier ?? "straight",
      streetName: s.name ?? "",
      location: s.maneuver.location,
    }));

    return {
      id: profile,
      profile,
      totalDurationSec: durationSec,
      totalDistanceM: Math.round(route.distance),
      departureTime: now,
      arrivalTime: now + durationSec * 1000,
      legs: [{
        mode: profile === "cycling" ? "CYCLING" : "WALK",
        durationSec,
        distanceM: Math.round(route.distance),
        departureTime: now,
        geometry: route.geometry.coordinates,
        steps,
      }],
    };
  } catch { return null; }
}

// ─── Google Maps transit routing ──────────────────────────────────────────────

async function buildTransitOptions(
  olat: number, olng: number,
  dlat: number, dlng: number
): Promise<RouteOption[]> {
  if (!GOOGLE_MAPS_KEY) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${olat},${olng}`);
  url.searchParams.set("destination", `${dlat},${dlng}`);
  url.searchParams.set("mode", "transit");
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("key", GOOGLE_MAPS_KEY);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "OK") return [];

    const now = Date.now();
    const options: RouteOption[] = [];

    for (const route of data.routes ?? []) {
      const gmLeg = route.legs?.[0];
      if (!gmLeg) continue;

      const legs: RouteLeg[] = [];
      let cursor = now;

      for (const step of gmLeg.steps ?? []) {
        const durationSec: number = step.duration.value;
        const distanceM: number = step.distance.value;
        const geometry = decodePolyline(step.polyline.points);
        const startCoord: [number, number] = geometry[0] ?? [olng, olat];

        if (step.travel_mode === "WALKING") {
          const subSteps: RouteStep[] = (step.steps ?? []).map((s: {
            html_instructions: string;
            distance: { value: number };
            duration: { value: number };
            maneuver?: string;
            polyline: { points: string };
          }) => {
            const { type, modifier } = parseManeuver(s.maneuver ?? "");
            const subGeom = decodePolyline(s.polyline.points);
            return {
              instruction: stripHtml(s.html_instructions),
              distanceM: s.distance.value,
              durationSec: s.duration.value,
              maneuverType: type,
              maneuverModifier: modifier,
              streetName: "",
              location: subGeom[0] ?? startCoord,
            };
          });

          legs.push({
            mode: "WALK",
            durationSec,
            distanceM,
            departureTime: cursor,
            geometry,
            steps: subSteps,
          });
          cursor += durationSec * 1000;

        } else if (step.travel_mode === "TRANSIT") {
          const td = step.transit_details;
          const line =
            td?.line?.short_name ??
            td?.line?.name ??
            "?";
          const headsign = td?.headsign ?? "";
          const boardStopName = td?.departure_stop?.name ?? "";
          const alightStopName = td?.arrival_stop?.name ?? "";

          // Departure time from real schedule
          const scheduledDepartureMs = td?.departure_time?.value
            ? td.departure_time.value * 1000
            : cursor;
          const waitSec = Math.max(0, Math.round((scheduledDepartureMs - cursor) / 1000));

          legs.push({
            mode: "TRANSIT",
            durationSec,
            distanceM,
            departureTime: scheduledDepartureMs,
            geometry,
            steps: [],
            line,
            headsign,
            boardStopName,
            alightStopName,
            waitSec,
          });
          cursor = scheduledDepartureMs + durationSec * 1000;
        }
      }

      if (legs.length === 0) continue;

      const transitLines = legs
        .filter((l) => l.mode === "TRANSIT")
        .map((l) => l.line)
        .join("+");

      options.push({
        id: `transit-${transitLines || "walk"}`,
        profile: "transit",
        totalDurationSec: gmLeg.duration.value,
        totalDistanceM: gmLeg.distance.value,
        departureTime: now,
        arrivalTime: now + gmLeg.duration.value * 1000,
        legs,
      });
    }

    return options.slice(0, 4);
  } catch { return []; }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const olat = searchParams.get("olat");
  const olng = searchParams.get("olng");
  const dlat = searchParams.get("dlat");
  const dlng = searchParams.get("dlng");

  if (!olat || !olng || !dlat || !dlng) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const [walkRoute, bikeRoute, transitRoutes] = await Promise.all([
    fetchMapboxRoute(olng, olat, dlng, dlat, "walking"),
    fetchMapboxRoute(olng, olat, dlng, dlat, "cycling"),
    buildTransitOptions(
      parseFloat(olat), parseFloat(olng),
      parseFloat(dlat), parseFloat(dlng)
    ),
  ]);

  const results: RouteOption[] = [
    ...transitRoutes,
    ...(walkRoute ? [walkRoute] : []),
    ...(bikeRoute ? [bikeRoute] : []),
  ];

  if (results.length === 0) {
    return NextResponse.json({ error: "No routes found" }, { status: 404 });
  }

  return NextResponse.json(results);
}
