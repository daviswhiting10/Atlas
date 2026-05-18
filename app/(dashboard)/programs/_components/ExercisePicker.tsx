"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2 } from "lucide-react";

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

const MOVEMENT_PATTERNS = [
  { value: "SQUAT", label: "Squat" },
  { value: "HINGE", label: "Hinge" },
  { value: "HORIZONTAL_PUSH", label: "Horizontal Push" },
  { value: "VERTICAL_PUSH", label: "Vertical Push" },
  { value: "HORIZONTAL_PULL", label: "Horizontal Pull" },
  { value: "VERTICAL_PULL", label: "Vertical Pull" },
  { value: "LUNGE", label: "Lunge" },
  { value: "CARRY", label: "Carry" },
  { value: "ROTATION", label: "Rotation" },
  { value: "ANTI_ROTATION", label: "Anti-Rotation" },
  { value: "LOCOMOTION", label: "Locomotion" },
];

const PATTERN_ABBR: Record<string, string> = {
  SQUAT: "SQ", HINGE: "HN", HORIZONTAL_PUSH: "H↑", VERTICAL_PUSH: "V↑",
  HORIZONTAL_PULL: "H↓", VERTICAL_PULL: "V↓", LUNGE: "LN", CARRY: "CR",
  ROTATION: "RT", ANTI_ROTATION: "AR", LOCOMOTION: "LC",
};

export function ExercisePicker({ onSelect, placeholder = "Search exercises..." }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExerciseOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newEquipment, setNewEquipment] = useState("");
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

  // Recalculate dropdown position whenever it opens
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
        setAdding(false);
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
    setAdding(false);
  }

  function startAdding() {
    setNewName(query);
    setNewPattern("");
    setNewEquipment("");
    setAdding(true);
  }

  async function saveNewExercise() {
    if (!newName.trim() || !newPattern || !newEquipment.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          movementPattern: newPattern,
          equipment: newEquipment.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const ex: ExerciseOption = await res.json();
      select(ex);
    } catch {
      // silently fail — user stays in form
    } finally {
      setSaving(false);
    }
  }

  return (
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
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching...</p>}
          {!loading && results.map((ex) => (
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

          {!loading && !adding && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted flex items-center gap-1.5 border-t border-border"
              onMouseDown={(e) => { e.preventDefault(); startAdding(); }}
            >
              <Plus className="w-3.5 h-3.5" />
              {results.length === 0 ? `Add "${query}" as new exercise` : "Add new exercise"}
            </button>
          )}

          {adding && (
            <div
              className="px-3 py-3 border-t border-border space-y-2"
              onMouseDown={(e) => e.preventDefault()}
            >
              <p className="text-xs font-medium">New exercise</p>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Exercise name"
                className="h-7 text-xs"
              />
              <select
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                className="w-full h-7 text-xs rounded-md border border-input px-2 bg-background"
              >
                <option value="">Movement pattern...</option>
                {MOVEMENT_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <Input
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value)}
                placeholder="Equipment (e.g. barbell, dumbbell, cable)"
                className="h-7 text-xs"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="flex-1 h-7 text-xs rounded-md border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNewExercise}
                  disabled={saving || !newName.trim() || !newPattern || !newEquipment.trim()}
                  className="flex-1 h-7 text-xs rounded-md bg-primary text-white disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save & add"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
