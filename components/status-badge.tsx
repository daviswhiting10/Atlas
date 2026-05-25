type ClientStatus = "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";

const config: Record<
  ClientStatus,
  { label: string; border: string; bg: string; color: string }
> = {
  PROSPECT: {
    label: "Prospect",
    border: "var(--line)",
    bg: "rgba(11,15,26,0.04)",
    color: "var(--ink-soft)",
  },
  ACTIVE: {
    label: "Active",
    border: "rgba(31,122,77,0.30)",
    bg: "rgba(31,122,77,0.07)",
    color: "var(--success)",
  },
  AT_RISK: {
    label: "At Risk",
    border: "rgba(180,83,9,0.30)",
    bg: "rgba(180,83,9,0.07)",
    color: "var(--warn)",
  },
  CHURNED: {
    label: "Churned",
    border: "rgba(200,52,26,0.30)",
    bg: "rgba(200,52,26,0.06)",
    color: "var(--destructive)",
  },
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  const cfg = config[status] ?? config.PROSPECT;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-body text-xs font-medium"
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
  NEW: {
    label: "New",
    border: "rgba(43,107,255,0.30)",
    bg: "rgba(43,107,255,0.07)",
    color: "var(--blue)",
  },
  CONTACTED: {
    label: "Contacted",
    border: "rgba(109,40,217,0.30)",
    bg: "rgba(109,40,217,0.06)",
    color: "#6D28D9",
  },
  REPLIED: {
    label: "Replied",
    border: "rgba(67,56,202,0.30)",
    bg: "rgba(67,56,202,0.06)",
    color: "#4338CA",
  },
  BOOKED: {
    label: "Booked",
    border: "rgba(180,83,9,0.30)",
    bg: "rgba(180,83,9,0.07)",
    color: "var(--warn)",
  },
  CONVERTED: {
    label: "Converted",
    border: "rgba(31,122,77,0.30)",
    bg: "rgba(31,122,77,0.07)",
    color: "var(--success)",
  },
  DEAD: {
    label: "Dead",
    border: "var(--line)",
    bg: "rgba(11,15,26,0.04)",
    color: "var(--ink-mute)",
  },
};

export function LeadStatusBadge({ status }: { status: string }) {
  const cfg = leadConfig[status as LeadStatus] ?? leadConfig.NEW;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-body text-xs font-medium"
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
