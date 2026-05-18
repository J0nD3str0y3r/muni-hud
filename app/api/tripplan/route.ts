import { NextRequest, NextResponse } from "next/server";
import { decodePolyline } from "@/lib/polyline";

const SF511_KEY = process.env.SF_511_API_KEY!;

export type RouteLeg = {
  mode: "WALK" | "TRANSIT";
  line?: string;
  lineName?: string;
  durationSec: number;
  distanceM: number;
  departureTime: number; // ms timestamp
  geometry: [number, number][];
};

export type RouteOption = {
  id: string;
  totalDurationSec: number;
  departureTime: number;
  arrivalTime: number;
  legs: RouteLeg[];
};

// 511 returns OTP 1.x format — be defensive about every field
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLeg(leg: any): RouteLeg {
  const mode = String(leg.mode ?? "WALK").toUpperCase();
  const isTransit = !["WALK", "BICYCLE", "CAR"].includes(mode);
  const points: string = leg.legGeometry?.points ?? "";
  const geometry = points ? decodePolyline(points) : [];

  return {
    mode: isTransit ? "TRANSIT" : "WALK",
    line: leg.route || leg.routeShortName || undefined,
    lineName: leg.routeLongName || undefined,
    durationSec: Math.round((leg.duration ?? 0)),
    distanceM: Math.round(leg.distance ?? 0),
    departureTime: leg.startTime ?? Date.now(),
    geometry,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItinerary(it: any, idx: number): RouteOption {
  const legs = (it.legs ?? []).map(parseLeg);
  return {
    id: String(idx),
    totalDurationSec: Math.round(it.duration ?? 0),
    departureTime: it.startTime ?? Date.now(),
    arrivalTime: it.endTime ?? Date.now(),
    legs,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const olat = searchParams.get("olat");
  const olng = searchParams.get("olng");
  const dlat = searchParams.get("dlat");
  const dlng = searchParams.get("dlng");

  if (!olat || !olng || !dlat || !dlng) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const url = new URL("https://api.511.org/transit/tripplan");
  url.searchParams.set("api_key", SF511_KEY);
  url.searchParams.set("origin", `${olat},${olng}`);
  url.searchParams.set("destination", `${dlat},${dlng}`);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    return NextResponse.json({ error: "511 API error" }, { status: 502 });
  }

  const data = await res.json();

  // 511 wraps OTP response — handle both `plan` and bare `itineraries`
  const itineraries: unknown[] =
    data?.plan?.itineraries ??
    data?.itineraries ??
    (Array.isArray(data) ? data : []);

  const routes: RouteOption[] = itineraries
    .slice(0, 4)
    .map((it, i) => parseItinerary(it, i));

  return NextResponse.json(routes);
}
