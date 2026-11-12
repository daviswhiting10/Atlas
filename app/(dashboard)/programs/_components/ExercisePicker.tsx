"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";

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
  const [saving, setSaving] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
      });
    }
  }, [open, results]);

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

  /** A new exercise, named as typed. */
  async function createFromQuery() {
    const name = query.trim();
    if (!name || saving) return;
    setSaving(true);
    setOpen(false);
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Couldn't add that exercise");
      }
      select((await res.json()) as ExerciseOption);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that exercise");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="pl-8 h-8 text-sm"
            onFocus={() => (results.length > 0 || query.length >= 2) && setOpen(true)}
          />
        </div>
        {open && (
          <div
            className="border rounded-md shadow-lg max-h-64 overflow-y-auto"
            style={dropdownStyle}
          >
            {(loading || saving) && <p className="px-3 py-2 text-xs text-muted-foreground">{saving ? "Adding…" : "Searching…"}</p>}
            {!loading && results.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                onMouseDown={(e) => { e.preventDefault(); select(ex); }}
              >
                <span className="truncate">{ex.name}</span>
              </button>
            ))}
            {!loading && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted flex items-center gap-1.5 border-t border-border"
                onMouseDown={(e) => { e.preventDefault(); createFromQuery(); }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add &ldquo;{query.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>

    </>
  );
}
