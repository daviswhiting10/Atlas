"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Client = {
  id: string;
  fullName: string;
  primaryGoal: string | null;
  status: string;
};

export function LogSessionCard({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const active = clients.filter((c) => c.status === "ACTIVE" || c.status === "AT_RISK");
  const filtered = (active.length > 0 ? active : clients).filter((c) =>
    c.fullName.toLowerCase().includes(query.toLowerCase())
  );

  function pick(clientId: string) {
    setOpen(false);
    router.push(`/clients/${clientId}/log`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/25"
      >
        <TrendingUp className="h-4 w-4" /> Log a session
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Log a session</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="pl-9"
            />
          </div>

          {/* Client list */}
          <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No clients found.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-body text-xs font-medium shrink-0"
                    style={{ background: "var(--ink)", color: "#fff" }}
                  >
                    {c.fullName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                      {c.fullName}
                    </p>
                    {c.primaryGoal && (
                      <p className="font-body text-xs truncate capitalize" style={{ color: "var(--ink-mute)" }}>
                        {c.primaryGoal.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
