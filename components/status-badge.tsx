import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ClientStatus = "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";

const config: Record<ClientStatus, { label: string; className: string }> = {
  PROSPECT: {
    label: "Prospect",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-100",
  },
  ACTIVE: {
    label: "Active",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  AT_RISK: {
    label: "At Risk",
    className: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  },
  CHURNED: {
    label: "Churned",
    className: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  },
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  const { label, className } = config[status] ?? config.PROSPECT;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", className)}>
      {label}
    </Badge>
  );
}

type LeadStatus = "NEW" | "CONTACTED" | "REPLIED" | "BOOKED" | "CONVERTED" | "DEAD";

const leadConfig: Record<LeadStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50" },
  CONTACTED: { label: "Contacted", className: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50" },
  REPLIED: { label: "Replied", className: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50" },
  BOOKED: { label: "Booked", className: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50" },
  CONVERTED: { label: "Converted", className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50" },
  DEAD: { label: "Dead", className: "bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-100" },
};

export function LeadStatusBadge({ status }: { status: string }) {
  const cfg = leadConfig[status as LeadStatus] ?? leadConfig.NEW;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
