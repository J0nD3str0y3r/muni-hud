"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Coords } from "@/app/page";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const WALK_SPEED_MS = 0.5;  // m/s threshold — below this, don't rotate map
const FOLLOW_ZOOM = 17;

export default function Map({ coords }: { coords: Coords | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const markerElRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-122.4194, 37.7749],
      zoom: FOLLOW_ZOOM,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Track position, heading, and smooth camera
  useEffect(() => {
    if (!coords || !mapRef.current) return;
    const map = mapRef.current;
    const lngLat: [number, number] = [coords.lng, coords.lat];
    const isMoving = coords.speed !== null && coords.speed > WALK_SPEED_MS;
    const hasHeading = coords.heading !== null && isMoving;

    // Create or update marker
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = [
        "width:20px",
        "height:20px",
        "position:relative",
        "display:flex",
        "align-items:center",
        "justify-content:center",
      ].join(";");

      // Inner dot
      const dot = document.createElement("div");
      dot.style.cssText = [
        "width:14px",
        "height:14px",
        "border-radius:50%",
        "background:#4f9cff",
        "border:2.5px solid white",
        "box-shadow:0 0 0 4px rgba(79,156,255,0.25)",
        "transition:transform 0.3s ease",
        "position:absolute",
      ].join(";");

      // Direction arrow (chevron pointing up — rotated by heading)
      const arrow = document.createElement("div");
      arrow.style.cssText = [
        "position:absolute",
        "top:-10px",
        "left:50%",
        "transform:translateX(-50%)",
        "width:0",
        "height:0",
        "border-left:5px solid transparent",
        "border-right:5px solid transparent",
        "border-bottom:9px solid #4f9cff",
        "opacity:0",
        "transition:opacity 0.3s ease",
      ].join(";");

      el.appendChild(arrow);
      el.appendChild(dot);
      markerElRef.current = el;

      markerRef.current = new mapboxgl.Marker({ element: el, rotationAlignment: "map" })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    // Show/hide arrow based on movement
    const el = markerElRef.current;
    if (el) {
      const arrow = el.children[0] as HTMLElement;
      arrow.style.opacity = isMoving ? "1" : "0";
    }

    // Smooth camera follow
    if (!initializedRef.current) {
      map.jumpTo({ center: lngLat, zoom: FOLLOW_ZOOM, bearing: coords.heading ?? 0 });
      initializedRef.current = true;
    } else {
      map.easeTo({
        center: lngLat,
        zoom: FOLLOW_ZOOM,
        bearing: hasHeading ? coords.heading! : map.getBearing(),
        duration: 800,
        easing: (t) => t * (2 - t), // ease-out
      });
    }
  }, [coords]);

  return <div ref={containerRef} className="w-full h-full" />;
}
