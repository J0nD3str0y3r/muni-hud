import { NextRequest, NextResponse } from "next/server";

const SF511_KEY = process.env.SF_511_API_KEY!;
const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function strip(text: string) {
  return text.replace(/^﻿/, "").trim();
}

// ─── 511 data fetchers ────────────────────────────────────────────────────────

type Stop = { id: string; name: string; lat: number; lng: number };

async function fetchAllStops(): Promise<Stop[]> {
  const res = await fetch(
    `https://api.511.org/transit/stops?api_key=${SF511_KEY}&operator_id=SF&format=json`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return [];
  const data = JSON.parse(strip(await res.text()));
  type R = { id: unknown; Name: unknown; Location?: { Latitude?: unknown; Longitude?: unknown } };
  return (data?.Contents?.dataObjects?.ScheduledStopPoint ?? []).map((s: R) => ({
    id: String(s.id),
    name: String(s.Name),
    lat: Number(s.Location?.Latitude),
    lng: Number(s.Location?.Longitude),
  })).filter((s: Stop) => s.lat && s.lng);
}

type Arrival = { line: string; headsign: string; minutes: number; stopName: string };

async function fetchArrivalsAt(stopId: string, stopName: string): Promise<Arrival[]> {
  const res = await fetch(
    `https://api.511.org/transit/StopMonitoring?api_key=${SF511_KEY}&agency=SF&stopCode=${stopId}&format=json`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = JSON.parse(strip(await res.text()));
  const visits = data?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit ?? [];

  return visits.flatMap((v: Record<string, unknown>) => {
    const j = v.MonitoredVehicleJourney as Record<string, unknown> | undefined;
    const call = (j?.MonitoredCall) as Record<string, unknown> | undefined;
    const line = String(j?.LineRef ?? "?").trim();
    if (line === "?") return [];
    const headsign = String(j?.DestinationName ?? j?.DirectionRef ?? "").trim();
    const timeStr = String(call?.ExpectedArrivalTime ?? call?.AimedArrivalTime ?? "");
    if (!timeStr) return [];
    const eta = new Date(timeStr).getTime();
    if (isNaN(eta)) return [];
    const minutes = Math.max(0, Math.round((eta - Date.now()) / 60_000));
    return [{ line, headsign, minutes, stopName }];
  });
}

// Attempt to get stops served by a line — returns empty array if endpoint 404s
async function fetchLineStops(lineId: string): Promise<Stop[]> {
  try {
    const res = await fetch(
      `https://api.511.org/transit/patterns?api_key=${SF511_KEY}&operator_id=SF&line_id=${encodeURIComponent(lineId)}&format=json`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = JSON.parse(strip(await res.text()));

    // Try multiple response shapes
    const patterns: unknown[] =
      data?.journeyPatterns ?? data?.JourneyPatterns ??
      (Array.isArray(data) ? data : []);

    const stopIds = new Set<string>();
    for (const pat of patterns) {
      const pts = (pat as Record<string, unknown>)?.PointsInSequence as Record<string, unknown> | undefined;
      const seq: unknown[] =
        (pts?.StopPointInJourneyPattern as unknown[]) ??
        (pts?.stopPointInJourneyPattern as unknown[]) ?? [];
      for (const pt of seq) {
        const ref = String((pt as Record<string, unknown>)?.StopPointRef ?? "");
        if (ref) stopIds.add(ref);
      }
    }
    return Array.from(stopIds).map(id => ({ id, name: "", lat: 0, lng: 0 }));
  } catch {
    return [];
  }
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

// ─── Transit option builder ───────────────────────────────────────────────────

async function fetchAllBartStops(): Promise<Stop[]> {
  const res = await fetch(
    `https://api.511.org/transit/stops?api_key=${SF511_KEY}&operator_id=BA&format=json`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return [];
  const data = JSON.parse(strip(await res.text()));
  type R = { id: unknown; Name: unknown; Location?: { Latitude?: unknown; Longitude?: unknown } };
  return (data?.Contents?.dataObjects?.ScheduledStopPoint ?? []).map((s: R) => ({
    id: String(s.id),
    name: String(s.Name),
    lat: Number(s.Location?.Latitude),
    lng: Number(s.Location?.Longitude),
  })).filter((s: Stop) => s.lat && s.lng);
}

async function fetchBartArrivalsAt(stopId: string, stopName: string): Promise<Arrival[]> {
  const res = await fetch(
    `https://api.511.org/transit/StopMonitoring?api_key=${SF511_KEY}&agency=BA&stopCode=${stopId}&format=json`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = JSON.parse(strip(await res.text()));
  const visits = data?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit ?? [];

  return visits.flatMap((v: Record<string, unknown>) => {
    const j = v.MonitoredVehicleJourney as Record<string, unknown> | undefined;
    const call = (j?.MonitoredCall) as Record<string, unknown> | undefined;
    const line = String(j?.LineRef ?? "?").trim();
    if (line === "?") return [];
    const headsign = String(j?.DestinationName ?? j?.DirectionRef ?? "").trim();
    const timeStr = String(call?.ExpectedArrivalTime ?? call?.AimedArrivalTime ?? "");
    if (!timeStr) return [];
    const eta = new Date(timeStr).getTime();
    if (isNaN(eta)) return [];
    const minutes = Math.max(0, Math.round((eta - Date.now()) / 60_000));
    return [{ line, headsign, minutes, stopName }];
  });
}

async function buildTransitOptions(
  olat: number, olng: number,
  dlat: number, dlng: number
): Promise<RouteOption[]> {
  const WALK_SPEED = 1.4;   // m/s (~3 mph)
  const MUNI_SPEED = 6;     // m/s (~13 mph)
  const BART_SPEED = 15;    // m/s (~34 mph)

  const [allStops, allBartStops] = await Promise.all([
    fetchAllStops(),
    fetchAllBartStops(),
  ]);
  if (allStops.length === 0 && allBartStops.length === 0) return [];

  type AgencyConfig = {
    stops: Stop[];
    destStops: Stop[];
    originStop: Stop;
    speed: number;
    agencyCode: "SF" | "BA";
    idPrefix: string;
  };

  const configs: AgencyConfig[] = [];

  if (allStops.length > 0) {
    const originStop = [...allStops].sort(
      (a, b) => haversineM(olat, olng, a.lat, a.lng) - haversineM(olat, olng, b.lat, b.lng)
    )[0];
    const destStops = [...allStops].sort(
      (a, b) => haversineM(dlat, dlng, a.lat, a.lng) - haversineM(dlat, dlng, b.lat, b.lng)
    ).slice(0, 8);
    configs.push({ stops: allStops, destStops, originStop, speed: MUNI_SPEED, agencyCode: "SF", idPrefix: "muni" });
  }

  if (allBartStops.length > 0) {
    const originStop = [...allBartStops].sort(
      (a, b) => haversineM(olat, olng, a.lat, a.lng) - haversineM(olat, olng, b.lat, b.lng)
    )[0];
    const destStops = [...allBartStops].sort(
      (a, b) => haversineM(dlat, dlng, a.lat, a.lng) - haversineM(dlat, dlng, b.lat, b.lng)
    ).slice(0, 5);
    configs.push({ stops: allBartStops, destStops, originStop, speed: BART_SPEED, agencyCode: "BA", idPrefix: "bart" });
  }

  const now = Date.now();
  const options: RouteOption[] = [];

  await Promise.all(configs.map(async ({ destStops, originStop, speed, agencyCode, idPrefix }) => {
    const fetchFn = agencyCode === "BA" ? fetchBartArrivalsAt : fetchArrivalsAt;
    const arrivals = await fetchFn(originStop.id, originStop.name);
    if (arrivals.length === 0) return;

    const byLine = new Map<string, Arrival>();
    for (const a of arrivals) {
      if (!byLine.has(a.line)) byLine.set(a.line, a);
    }

    await Promise.all(Array.from(byLine.values()).map(async (arrival) => {
      const walkToBoardM = haversineM(olat, olng, originStop.lat, originStop.lng);
      const walkToBoardSec = walkToBoardM / WALK_SPEED;

      let alightStop: Stop | null = null;
      if (agencyCode === "SF") {
        const lineStops = await fetchLineStops(arrival.line);
        if (lineStops.length > 0) {
          for (const ds of destStops) {
            if (lineStops.some(ls => ls.id === ds.id)) { alightStop = ds; break; }
          }
        }
      }
      if (!alightStop) alightStop = destStops[0];
      if (!alightStop) return;

      const transitM = haversineM(originStop.lat, originStop.lng, alightStop.lat, alightStop.lng);
      const transitSec = transitM / speed;
      const waitSec = arrival.minutes * 60;
      const walkFromAlightM = haversineM(alightStop.lat, alightStop.lng, dlat, dlng);
      const walkFromAlightSec = walkFromAlightM / WALK_SPEED;
      const totalSec = walkToBoardSec + waitSec + transitSec + walkFromAlightSec;

      if (transitM < walkToBoardM * 0.5) return;

      options.push({
        id: `${idPrefix}-${arrival.line}`,
        profile: "transit",
        totalDurationSec: Math.round(totalSec),
        totalDistanceM: Math.round(walkToBoardM + transitM + walkFromAlightM),
        departureTime: now,
        arrivalTime: now + totalSec * 1000,
        legs: [
          {
            mode: "WALK",
            durationSec: Math.round(walkToBoardSec),
            distanceM: Math.round(walkToBoardM),
            departureTime: now,
            geometry: [[olng, olat], [originStop.lng, originStop.lat]],
            steps: [],
          },
          {
            mode: "TRANSIT",
            durationSec: Math.round(transitSec),
            distanceM: Math.round(transitM),
            departureTime: now + walkToBoardSec * 1000,
            geometry: [[originStop.lng, originStop.lat], [alightStop.lng, alightStop.lat]],
            steps: [],
            line: arrival.line,
            headsign: arrival.headsign,
            boardStopName: originStop.name,
            alightStopName: alightStop.name,
            waitSec,
          },
          {
            mode: "WALK",
            durationSec: Math.round(walkFromAlightSec),
            distanceM: Math.round(walkFromAlightM),
            departureTime: now + (walkToBoardSec + waitSec + transitSec) * 1000,
            geometry: [[alightStop.lng, alightStop.lat], [dlng, dlat]],
            steps: [],
          },
        ],
      });
    }));
  }));

  return options
    .sort((a, b) => a.totalDurationSec - b.totalDurationSec)
    .slice(0, 5);
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
