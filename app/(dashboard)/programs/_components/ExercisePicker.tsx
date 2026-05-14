"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export type ExerciseOption = {
  id: string;
  name: string;
  movementPattern: string;
  equipment: string;
};

type Props = {
  onSelect: (ex: ExerciseOption) => void;
  placeholder?: string;
};

export function ExercisePicker({ onSelect, placeholder = "Search exercises..." }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExerciseOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/exercises?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data.slice(0, 20) : []);
      setOpen(true);
      setLoading(false);
    }, 250);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(ex: ExerciseOption) {
    onSelect(ex);
    setQuery("");
    setOpen(false);
    setResults([]);
  }

  const PATTERN_ABBR: Record<string, string> = {
    SQUAT: "SQ", HINGE: "HN", HORIZONTAL_PUSH: "H↑", VERTICAL_PUSH: "V↑",
    HORIZONTAL_PULL: "H↓", VERTICAL_PULL: "V↓", LUNGE: "LN", CARRY: "CR",
    ROTATION: "RT", ANTI_ROTATION: "AR", LOCOMOTION: "LC",
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-8 h-8 text-sm"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-md max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching...</p>}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No exercises found</p>
          )}
          {results.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
              onMouseDown={(e) => { e.preventDefault(); select(ex); }}
            >
              <span className="truncate">{ex.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {PATTERN_ABBR[ex.movementPattern] ?? ex.movementPattern} · {ex.equipment}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
