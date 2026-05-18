import { NextResponse } from "next/server";

// Temporary diagnostic endpoint — hit /api/debug in the browser to see what 511 returns
// Delete this file once the trip planner is working

export async function GET() {
  const key = process.env.SF_511_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "SF_511_API_KEY is not set in environment variables" });
  }

  // Test with SF City Hall → Caltrain (known SF coords)
  const url = new URL("https://api.511.org/transit/tripplan");
  url.searchParams.set("api_key", key);
  url.searchParams.set("origin", "37.7793,  -122.4193"); // SF Civic Center
  url.searchParams.set("destination", "37.7764,-122.3942"); // SF Caltrain
  url.searchParams.set("format", "json");

  let status: number;
  let body: string;
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    status = res.status;
    body = await res.text();
  } catch (e) {
    return NextResponse.json({ error: "fetch failed", detail: String(e) });
  }

  // Strip BOM then show first 2000 chars
  const cleaned = body.replace(/^﻿/, "").trim();
  let parsed: unknown = null;
  try { parsed = JSON.parse(cleaned); } catch { /* show raw */ }

  return NextResponse.json({
    keyPresent: true,
    keyPrefix: key.slice(0, 8) + "…",
    status511: status,
    rawPreview: cleaned.slice(0, 1000),
    parsed: parsed ?? "(not valid JSON)",
  });
}
