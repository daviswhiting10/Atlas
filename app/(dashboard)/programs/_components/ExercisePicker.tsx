"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Loader2 } from "lucide-react";
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
  const [dialogOpen, setDialogOpen] = useState(false);
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

  function openDialog() {
    setNewName(query);
    setNewPattern("");
    setNewEquipment("");
    setOpen(false);
    setDialogOpen(true);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save");
      }
      const ex: ExerciseOption = await res.json();
      toast.success(`"${ex.name}" added to library`);
      setDialogOpen(false);
      setQuery("");
      select(ex);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save exercise");
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
            {!loading && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted flex items-center gap-1.5 border-t border-border"
                onMouseDown={(e) => { e.preventDefault(); openDialog(); }}
              >
                <Plus className="w-3.5 h-3.5" />
                {results.length === 0 ? `Add "${query}" as new exercise` : "Add new exercise"}
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new exercise</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Exercise name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Movement pattern</label>
              <select
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                className="w-full h-9 text-sm rounded-md border border-input px-3 bg-background"
              >
                <option value="">Select pattern...</option>
                {MOVEMENT_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Equipment</label>
              <Input
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value)}
                placeholder="e.g. band, dumbbell, barbell, bodyweight"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={saveNewExercise}
              disabled={saving || !newName.trim() || !newPattern || !newEquipment.trim()}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save & add to program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
