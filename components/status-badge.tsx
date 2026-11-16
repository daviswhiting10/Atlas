type ClientStatus = "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";

/** A badge is a tint of one Dusk colour: its outline and wash at a fraction, its text at full strength. */
const tone = (color: string) => ({ border: `color-mix(in srgb, ${color} 35%, transparent)`, bg: `color-mix(in srgb, ${color} 10%, transparent)`, color });
const quietTone = { border: "var(--line)", bg: "color-mix(in srgb, var(--ink) 4%, transparent)" };

const config: Record<
  ClientStatus,
  { label: string; border: string; bg: string; color: string }
> = {
  PROSPECT: { label: "Prospect", ...quietTone, color: "var(--ink-soft)" },
  ACTIVE: { label: "Active", ...tone("var(--dusk-teal)") },
  AT_RISK: { label: "At Risk", ...tone("var(--dusk-peach)") },
  CHURNED: { label: "Churned", ...tone("var(--destructive)") },
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  const cfg = config[status] ?? config.PROSPECT;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        borderColor: cfg.border,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

type LeadStatus = "NEW" | "CONTACTED" | "REPLIED" | "BOOKED" | "CONVERTED" | "DEAD";

const leadConfig: Record<
  LeadStatus,
  { label: string; border: string; bg: string; color: string }
> = {
  NEW: { label: "New", ...tone("var(--dusk-teal)") },
  CONTACTED: { label: "Contacted", ...tone("var(--dusk-purple)") },
  REPLIED: { label: "Replied", ...tone("var(--dusk-purple)") },
  BOOKED: { label: "Booked", ...tone("var(--dusk-peach)") },
  CONVERTED: { label: "Converted", ...tone("var(--dusk-teal)") },
  DEAD: { label: "Dead", ...quietTone, color: "var(--ink-mute)" },
};

export function LeadStatusBadge({ status }: { status: string }) {
  const cfg = leadConfig[status as LeadStatus] ?? leadConfig.NEW;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        borderColor: cfg.border,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}
