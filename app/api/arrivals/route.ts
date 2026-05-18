import { NextRequest, NextResponse } from "next/server";

const SF511_KEY = process.env.SF_511_API_KEY!;

type Stop = { id: string; name: string; lat: number; lon: number };
type Prediction = { line: string; minutes: number; stopName: string };

// Haversine distance in meters
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
  const url =
    `https://api.511.org/transit/stops?api_key=${SF511_KEY}&operator_id=SF&format=json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const data = await res.json();
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

async function fetchArrivals(stopId: string, stopName: string): Promise<Prediction[]> {
  const url =
    `https://api.511.org/transit/StopMonitoring?api_key=${SF511_KEY}&agency=SF&stopCode=${stopId}&format=json`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const data = await res.json();
  const visits =
    data?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit ?? [];

  return visits
    .slice(0, 5)
    .map((v: Record<string, unknown>) => {
      const journey = (v as { MonitoredVehicleJourney?: Record<string, unknown> })
        .MonitoredVehicleJourney;
      const call = (journey as { MonitoredCall?: Record<string, unknown> })?.MonitoredCall;
      const aimed = String((call as { AimedArrivalTime?: unknown })?.AimedArrivalTime ?? "");
      const now = Date.now();
      const eta = new Date(aimed).getTime();
      const minutes = Math.max(0, Math.round((eta - now) / 60_000));
      const line = String(
        (journey as { PublishedLineName?: unknown })?.PublishedLineName ?? "?"
      );
      return { line, minutes, stopName };
    })
    .filter((p: Prediction) => p.line !== "?");
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

  const arrivals = await fetchArrivals(stop.id, stop.name);
  return NextResponse.json(arrivals);
}
