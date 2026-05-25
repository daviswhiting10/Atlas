import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ClientStatus = "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";

const config: Record<ClientStatus, { label: string; className: string }> = {
  PROSPECT: {
    label: "Prospect",
    className: "border-[var(--line)] text-[var(--ink-soft)] bg-[var(--muted)] hover:bg-[var(--muted)]",
  },
  ACTIVE: {
    label: "Active",
    className: "border-green-300 text-green-700 bg-green-50 hover:bg-green-50",
  },
  AT_RISK: {
    label: "At Risk",
    className: "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-50",
  },
  CHURNED: {
    label: "Churned",
    className: "border-red-300 text-red-700 bg-red-50 hover:bg-red-50",
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
  NEW:       { label: "New",       className: "border-blue-300  text-blue-700   bg-blue-50  hover:bg-blue-50" },
  CONTACTED: { label: "Contacted", className: "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-50" },
  REPLIED:   { label: "Replied",   className: "border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-50" },
  BOOKED:    { label: "Booked",    className: "border-amber-300  text-amber-700  bg-amber-50 hover:bg-amber-50" },
  CONVERTED: { label: "Converted", className: "border-green-300  text-green-700  bg-green-50 hover:bg-green-50" },
  DEAD:      { label: "Dead",      className: "border-[var(--line)] text-[var(--ink-mute)] bg-[var(--muted)] hover:bg-[var(--muted)]" },
};

export function LeadStatusBadge({ status }: { status: string }) {
  const cfg = leadConfig[status as LeadStatus] ?? leadConfig.NEW;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
