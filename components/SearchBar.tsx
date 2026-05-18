"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Coords } from "@/app/page";

export type Destination = {
  name: string;
  lng: number;
  lat: number;
};

type Suggestion = {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
};

type Props = {
  userCoords: Coords | null;
  onSelect: (dest: Destination) => void;
  onClear: () => void;
  hasDestination: boolean;
};

export default function SearchBar({ userCoords, onSelect, onClear, hasDestination }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (q.length < 2) { setSuggestions([]); return; }
      const proximity = userCoords
        ? `&proximity=${userCoords.lng},${userCoords.lat}`
        : "";
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${token}&country=US&types=address,poi,place&limit=5${proximity}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features ?? []);
      } catch {
        setSuggestions([]);
      }
    },
    [token, userCoords]
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, fetchSuggestions]);

  function handleSelect(s: Suggestion) {
    setQuery(s.place_name);
    setSuggestions([]);
    setOpen(false);
    onSelect({ name: s.place_name, lng: s.center[0], lat: s.center[1] });
  }

  function handleClear() {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    onClear();
  }

  return (
    <div className="relative w-full max-w-sm">
      <div className="flex items-center bg-black/70 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 gap-2">
        <svg className="w-3.5 h-3.5 text-white/40 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Where to?"
          className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none min-w-0"
        />
        {(query || hasDestination) && (
          <button onClick={handleClear} className="text-white/40 hover:text-white/80 transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-black/90 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden z-50">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:bg-white/10 active:bg-white/15 transition-colors border-b border-white/5 last:border-0 truncate"
              >
                {s.place_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
