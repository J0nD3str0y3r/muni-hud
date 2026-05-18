"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Coords } from "@/app/page";
import type { RouteOption } from "@/app/api/tripplan/route";

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
}: {
  coords: Coords | null;
  route: RouteOption | null;
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
          "line-color": ["match", ["get", "mode"], "CYCLING", "#a8ff78", "#4f9cff"],
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
      .map((leg) => ({
        type: "Feature" as const,
        properties: { mode: leg.mode },
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

  return <div ref={containerRef} className="w-full h-full" />;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
