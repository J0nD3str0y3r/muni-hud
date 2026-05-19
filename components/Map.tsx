"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Coords } from "@/app/page";
import type { RouteOption } from "@/app/api/tripplan/route";
import type { StopPin } from "@/components/EtaPanel";
import { lineColor } from "@/lib/lineColor";
import type { RouteLeg } from "@/app/api/tripplan/route";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const WALK_SPEED_MS = 0.5;
const FOLLOW_ZOOM = 17;
const ROUTE_SOURCE = "route-source";
const WALK_LAYER = "route-walk";
const TRANSIT_LAYER = "route-transit";
const DEST_SOURCE = "dest-source";
const DEST_LAYER = "dest-layer";

export default function Map({
  coords,
  route,
  stopPin,
}: {
  coords: Coords | null;
  route: RouteOption | null;
  stopPin: StopPin | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const markerElRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const routeLayersRef = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-122.4194, 37.7749],
      zoom: FOLLOW_ZOOM,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    });

    map.on("load", () => {
      // Walk layer (dashed white)
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: WALK_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["==", ["get", "mode"], "WALK"],
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.4,
          "line-width": 3,
          "line-dasharray": [2, 3],
        },
      });
      map.addLayer({
        id: TRANSIT_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        filter: ["in", ["get", "mode"], ["literal", ["TRANSIT", "CYCLING"]]],
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "mode"], "CYCLING"], "#a8ff78",
            ["coalesce", ["get", "lineColor"], "#4f9cff"],
          ],
          "line-opacity": 0.85,
          "line-width": 4,
        },
      });

      // Destination dot
      map.addSource(DEST_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: DEST_LAYER,
        type: "circle",
        source: DEST_SOURCE,
        paint: {
          "circle-radius": 8,
          "circle-color": "#ff6b6b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      routeLayersRef.current = true;
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      routeLayersRef.current = false;
    };
  }, []);

  // Track user position
  useEffect(() => {
    if (!coords || !mapRef.current) return;
    const map = mapRef.current;
    const lngLat: [number, number] = [coords.lng, coords.lat];
    const isMoving = coords.speed !== null && coords.speed > WALK_SPEED_MS;
    const hasHeading = coords.heading !== null && isMoving;

    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:20px;height:20px;position:relative;display:flex;align-items:center;justify-content:center";

      const dot = document.createElement("div");
      dot.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#4f9cff;border:2.5px solid white;" +
        "box-shadow:0 0 0 4px rgba(79,156,255,0.25);position:absolute";

      const arrow = document.createElement("div");
      arrow.style.cssText =
        "position:absolute;top:-10px;left:50%;transform:translateX(-50%);" +
        "width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;" +
        "border-bottom:9px solid #4f9cff;opacity:0;transition:opacity 0.3s ease";

      el.appendChild(arrow);
      el.appendChild(dot);
      markerElRef.current = el;

      markerRef.current = new mapboxgl.Marker({ element: el, rotationAlignment: "map" })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    if (markerElRef.current) {
      (markerElRef.current.children[0] as HTMLElement).style.opacity = isMoving ? "1" : "0";
    }

    if (!initializedRef.current) {
      map.jumpTo({ center: lngLat, zoom: FOLLOW_ZOOM, bearing: coords.heading ?? 0 });
      initializedRef.current = true;
    } else {
      map.easeTo({
        center: lngLat,
        zoom: FOLLOW_ZOOM,
        bearing: hasHeading ? coords.heading! : map.getBearing(),
        duration: 800,
        easing: (t) => t * (2 - t),
      });
    }
  }, [coords]);

  // Draw or clear route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeLayersRef.current) return;

    if (!route) {
      (map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource)?.setData(emptyFC());
      (map.getSource(DEST_SOURCE) as mapboxgl.GeoJSONSource)?.setData(emptyFC());
      return;
    }

    // Route lines
    const features = route.legs
      .filter((leg) => leg.geometry.length > 1)
      .map((leg: RouteLeg) => ({
        type: "Feature" as const,
        properties: {
          mode: leg.mode,
          lineColor: leg.mode === "TRANSIT"
            ? (leg.lineColorHex ?? lineColor(leg.line ?? ""))
            : null,
        },
        geometry: { type: "LineString" as const, coordinates: leg.geometry },
      }));
    (map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features,
    });

    // Destination marker — last coord of last leg
    const lastLeg = route.legs[route.legs.length - 1];
    const destCoord = lastLeg?.geometry[lastLeg.geometry.length - 1];
    if (destCoord) {
      (map.getSource(DEST_SOURCE) as mapboxgl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: destCoord },
        }],
      });

      // Fit map to show full route
      const allCoords = route.legs.flatMap((l) => l.geometry);
      if (allCoords.length > 1) {
        const bounds = allCoords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new mapboxgl.LngLatBounds(allCoords[0] as [number, number], allCoords[0] as [number, number])
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 1000 });
      }
    }
  }, [route]);

  // Stop pin marker — updates whenever nearest stop changes
  const stopMarkerRef = useRef<mapboxgl.Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkerRef.current?.remove();
    stopMarkerRef.current = null;

    if (!stopPin) return;

    // Build a small pill showing all line colors
    const el = document.createElement("div");
    el.style.cssText =
      "display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default";

    const pill = document.createElement("div");
    pill.style.cssText =
      "display:flex;gap:3px;background:rgba(0,0,0,0.75);border:1px solid rgba(255,255,255,0.15);" +
      "border-radius:8px;padding:3px 6px;backdrop-filter:blur(8px)";

    stopPin.lines.slice(0, 4).forEach((line) => {
      const bg = lineColor(line);
      const r = parseInt(bg.slice(1, 3), 16);
      const g = parseInt(bg.slice(3, 5), 16);
      const b = parseInt(bg.slice(5, 7), 16);
      const fg = (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? "#fff" : "#000";
      const badge = document.createElement("span");
      badge.textContent = line;
      badge.style.cssText =
        `background:${bg};color:${fg};font-size:9px;font-weight:700;` +
        "border-radius:4px;padding:1px 5px;white-space:nowrap";
      pill.appendChild(badge);
    });

    // Small triangle stem pointing down
    const stem = document.createElement("div");
    stem.style.cssText =
      "width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;" +
      "border-top:6px solid rgba(0,0,0,0.75)";

    el.appendChild(pill);
    el.appendChild(stem);

    stopMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([stopPin.lng, stopPin.lat])
      .addTo(map);
  }, [stopPin]);

  return <div ref={containerRef} className="w-full h-full" />;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
