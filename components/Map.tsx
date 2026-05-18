"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Coords } from "@/app/page";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export default function Map({ coords }: { coords: Coords | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-122.4194, 37.7749], // SF default until location resolves
      zoom: 15,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Track location dot and fly to it
  useEffect(() => {
    if (!coords || !mapRef.current) return;
    const map = mapRef.current;
    const lngLat: [number, number] = [coords.lng, coords.lat];

    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "location-dot";
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#4f9cff;border:2px solid white;box-shadow:0 0 0 4px rgba(79,156,255,0.25);";
      markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
      map.flyTo({ center: lngLat, zoom: 15, speed: 1.2 });
    } else {
      markerRef.current.setLngLat(lngLat);
    }
  }, [coords]);

  return <div ref={containerRef} className="w-full h-full" />;
}
