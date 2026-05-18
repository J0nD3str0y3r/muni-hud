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
  agency: "MUNI" | "BART";
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

function strip(text: string) {
  return text.replace(/^﻿/, "").trim();
}

async function fetchNearestStop(lat: number, lng: number, operatorId: string): Promise<Stop | null> {
  const url = `https://api.511.org/transit/stops?api_key=${SF511_KEY}&operator_id=${operatorId}&format=json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const data = JSON.parse(strip(await res.text()));
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

async function fetchArrivals(stop: Stop, agency: "MUNI" | "BART"): Promise<Arrival[]> {
  const agencyCode = agency === "BART" ? "BA" : "SF";
  const url =
    `https://api.511.org/transit/StopMonitoring?api_key=${SF511_KEY}&agency=${agencyCode}&stopCode=${stop.id}&format=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const data = JSON.parse(strip(await res.text()));
  const visits: Record<string, unknown>[] =
    data?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit ?? [];

  return visits
    .slice(0, 6)
    .flatMap((v) => {
      const journey = v.MonitoredVehicleJourney as Record<string, unknown> | undefined;
      const call = (journey?.MonitoredCall) as Record<string, unknown> | undefined;

      const line = String(journey?.LineRef ?? journey?.PublishedLineName ?? "?").trim();
      if (line === "?") return [];

      const headsign = String(
        journey?.DestinationName ??
        call?.DestinationDisplay ??
        journey?.DirectionRef ??
        ""
      ).trim();

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
        agency,
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

  // Fetch nearest MUNI stop and nearest BART station in parallel
  const [muniStop, bartStop] = await Promise.all([
    fetchNearestStop(lat, lng, "SF"),
    fetchNearestStop(lat, lng, "BA"),
  ]);

  const [muniArrivals, bartArrivals] = await Promise.all([
    muniStop ? fetchArrivals(muniStop, "MUNI") : Promise.resolve([]),
    bartStop ? fetchArrivals(bartStop, "BART") : Promise.resolve([]),
  ]);

  // Sort combined by minutes, BART first when tied (it's faster)
  const all = [...muniArrivals, ...bartArrivals].sort((a, b) => {
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return a.agency === "BART" ? -1 : 1;
  });

  return NextResponse.json(all);
}
