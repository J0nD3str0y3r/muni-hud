import { NextRequest, NextResponse } from "next/server";

const SF511_KEY = process.env.SF_511_API_KEY!;

type Stop = { id: string; name: string; lat: number; lon: number };
export type Arrival = {
  line: string;
  headsign: string;
  minutes: number;
  stopName: string;
  stopId: string;
  stopLat: number;
  stopLng: number;
};

function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNearestStop(lat: number, lng: number): Promise<Stop | null> {
  const url = `https://api.511.org/transit/stops?api_key=${SF511_KEY}&operator_id=SF&format=json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const raw = await res.text();
  const data = JSON.parse(raw.replace(/^﻿/, ""));
  type RawStop = { id: unknown; Name: unknown; Location?: { Latitude?: unknown; Longitude?: unknown } };
  const stops: Stop[] = (data?.Contents?.dataObjects?.ScheduledStopPoint ?? []).map(
    (s: RawStop) => ({
      id: String(s.id),
      name: String(s.Name),
      lat: Number(s.Location?.Latitude),
      lon: Number(s.Location?.Longitude),
    })
  );

  return stops
    .filter((s) => s.lat && s.lon)
    .sort((a, b) => distance(lat, lng, a.lat, a.lon) - distance(lat, lng, b.lat, b.lon))[0] ?? null;
}

async function fetchArrivals(stop: Stop): Promise<Arrival[]> {
  const url =
    `https://api.511.org/transit/StopMonitoring?api_key=${SF511_KEY}&agency=SF&stopCode=${stop.id}&format=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const raw = await res.text();
  const data = JSON.parse(raw.replace(/^﻿/, ""));
  const visits: Record<string, unknown>[] =
    data?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit ?? [];

  return visits
    .slice(0, 6)
    .flatMap((v) => {
      const journey = v.MonitoredVehicleJourney as Record<string, unknown> | undefined;
      const call = (journey?.MonitoredCall) as Record<string, unknown> | undefined;

      // LineRef is the route short name (9R, 38, N, etc.)
      // PublishedLineName is often the direction/destination — don't use it for line
      const line = String(journey?.LineRef ?? journey?.PublishedLineName ?? "?").trim();
      if (line === "?") return [];

      // Headsign: DestinationName is where the vehicle is headed
      const headsign = String(
        journey?.DestinationName ??
        call?.DestinationDisplay ??
        journey?.DirectionRef ??
        ""
      ).trim();

      // Prefer ExpectedArrivalTime for real-time, fall back to Aimed
      const timeStr = String(
        call?.ExpectedArrivalTime ??
        call?.AimedArrivalTime ??
        ""
      );
      if (!timeStr) return [];

      const eta = new Date(timeStr).getTime();
      if (isNaN(eta)) return [];
      const minutes = Math.max(0, Math.round((eta - Date.now()) / 60_000));

      return [{
        line,
        headsign,
        minutes,
        stopName: stop.name,
        stopId: stop.id,
        stopLat: stop.lat,
        stopLng: stop.lon,
      }];
    });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "bad coords" }, { status: 400 });
  }

  const stop = await fetchNearestStop(lat, lng);
  if (!stop) return NextResponse.json([]);

  const arrivals = await fetchArrivals(stop);
  return NextResponse.json(arrivals);
}
