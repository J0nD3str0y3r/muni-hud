import { NextRequest, NextResponse } from "next/server";
import { decodePolyline } from "@/lib/polyline";

const SF511_KEY = process.env.SF_511_API_KEY;

export type RouteLeg = {
  mode: "WALK" | "TRANSIT";
  line?: string;
  lineName?: string;
  durationSec: number;
  distanceM: number;
  departureTime: number;
  geometry: [number, number][];
};

export type RouteOption = {
  id: string;
  totalDurationSec: number;
  departureTime: number;
  arrivalTime: number;
  legs: RouteLeg[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLeg(leg: any): RouteLeg {
  const mode = String(leg.mode ?? leg.transportation?.mode ?? "WALK").toUpperCase();
  const isTransit = !["WALK", "BICYCLE", "CAR"].includes(mode);
  const points: string = leg.legGeometry?.points ?? leg.LegGeometry?.points ?? "";
  const geometry = points ? decodePolyline(points) : [];
  const line =
    leg.route || leg.routeShortName || leg.Route ||
    leg.Transportation?.PublicCode || leg.transportation?.publicCode || undefined;
  const lineName =
    leg.routeLongName || leg.RouteLongName ||
    leg.Transportation?.Name || leg.transportation?.name || undefined;

  // startTime can be ms timestamp or ISO string
  let departureTime = Date.now();
  const raw = leg.startTime ?? leg.StartTime ?? leg.departureTime;
  if (typeof raw === "number") departureTime = raw;
  else if (typeof raw === "string") departureTime = new Date(raw).getTime();

  return {
    mode: isTransit ? "TRANSIT" : "WALK",
    line,
    lineName,
    durationSec: Math.round(leg.duration ?? leg.Duration ?? 0),
    distanceM: Math.round(leg.distance ?? leg.Distance ?? 0),
    departureTime,
    geometry,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItinerary(it: any, idx: number): RouteOption {
  const rawLegs = it.legs ?? it.Leg ?? it.leg ?? [];
  const legs = (Array.isArray(rawLegs) ? rawLegs : [rawLegs]).map(parseLeg);

  // duration can be seconds (number) or ISO 8601 "PT20M30S"
  let totalDurationSec = 0;
  const dur = it.duration ?? it.Duration;
  if (typeof dur === "number") totalDurationSec = dur;
  else if (typeof dur === "string" && dur.startsWith("PT")) {
    const m = dur.match(/(\d+H)?(\d+M)?(\d+S)?/);
    if (m) {
      totalDurationSec =
        (parseInt(m[1] ?? "0") || 0) * 3600 +
        (parseInt(m[2] ?? "0") || 0) * 60 +
        (parseInt(m[3] ?? "0") || 0);
    }
  }

  const startRaw = it.startTime ?? it.StartTime ?? it.departureTime;
  const endRaw = it.endTime ?? it.EndTime ?? it.arrivalTime;
  const departureTime = typeof startRaw === "number" ? startRaw : new Date(startRaw ?? Date.now()).getTime();
  const arrivalTime = typeof endRaw === "number" ? endRaw : new Date(endRaw ?? Date.now()).getTime();

  return { id: String(idx), totalDurationSec, departureTime, arrivalTime, legs };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractItineraries(data: any): any[] {
  // OTP standard
  if (Array.isArray(data?.plan?.itineraries)) return data.plan.itineraries;
  if (Array.isArray(data?.itineraries)) return data.itineraries;
  // 511 SIRI-style
  const siri =
    data?.Siri?.ServiceDelivery?.TripPlanningDelivery?.TripPlan ??
    data?.ServiceDelivery?.TripPlanningDelivery?.TripPlan ??
    data?.TripPlan;
  if (siri) {
    const it = siri.Itinerary ?? siri.itinerary;
    return Array.isArray(it) ? it : it ? [it] : [];
  }
  if (Array.isArray(data)) return data;
  return [];
}

export async function GET(req: NextRequest) {
  if (!SF511_KEY) {
    console.error("[tripplan] SF_511_API_KEY is not set");
    return NextResponse.json({ error: "SF_511_API_KEY not configured" }, { status: 500 });
  }

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

  let raw: string;
  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
    raw = await res.text();
  } catch (e) {
    console.error("[tripplan] fetch failed:", e);
    return NextResponse.json({ error: "network error" }, { status: 502 });
  }

  if (!res.ok) {
    console.error("[tripplan] 511 returned", res.status, raw.slice(0, 500));
    return NextResponse.json({ error: `511 error ${res.status}`, detail: raw.slice(0, 200) }, { status: 502 });
  }

  // Strip BOM (﻿) — 511 commonly includes it
  const cleaned = raw.replace(/^﻿/, "").trim();

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    console.error("[tripplan] JSON parse failed:", e, "raw:", cleaned.slice(0, 300));
    return NextResponse.json({ error: "JSON parse failed", detail: cleaned.slice(0, 200) }, { status: 502 });
  }

  const itineraries = extractItineraries(data);
  console.log("[tripplan] found", itineraries.length, "itineraries");

  if (itineraries.length === 0) {
    console.error("[tripplan] no itineraries in response. Keys:", Object.keys(data as object));
    return NextResponse.json({ error: "no routes", detail: JSON.stringify(data).slice(0, 300) }, { status: 404 });
  }

  const routes: RouteOption[] = itineraries.slice(0, 4).map(parseItinerary);
  return NextResponse.json(routes);
}
