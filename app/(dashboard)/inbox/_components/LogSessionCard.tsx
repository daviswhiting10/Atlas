"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
      <button type="button" className="text-left w-full" onClick={() => setOpen(true)}>
        <Card lift className="cursor-pointer">
          <CardContent className="py-4 px-4 flex items-center gap-3 sm:flex-col sm:items-start sm:pt-5 sm:gap-2 min-h-[72px] sm:min-h-[120px]">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(43,107,255,0.08)" }}
            >
              <TrendingUp className="w-[18px] h-[18px]" style={{ color: "var(--blue)" }} />
            </div>
            <div>
              <p className="font-body text-sm font-medium" style={{ color: "var(--ink)" }}>
                Log Session
              </p>
              <p className="font-body text-xs" style={{ color: "var(--ink-mute)" }}>
                Pick a client to log
              </p>
            </div>
          </CardContent>
        </Card>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Log a session</DialogTitle>
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
                    style={{ background: "rgba(43,107,255,0.08)", color: "var(--blue)" }}
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
