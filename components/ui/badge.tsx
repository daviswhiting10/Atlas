import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// All badges are outlined — no filled defaults.
// Badges use a tint of the signal colour, never a saturated fill.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 font-body text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dusk-teal)]/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // Teal outlined: the accent state
        default:
          "border-[color-mix(in_srgb,var(--dusk-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--dusk-teal)_10%,transparent)] text-[var(--dusk-teal)]",
        // Ink outlined — neutral/secondary
        secondary:
          "border-[var(--line)] bg-transparent text-[var(--ink-soft)]",
        // Coral outlined: error
        destructive:
          "border-[rgba(242,135,122,0.4)] bg-[rgba(242,135,122,0.1)] text-[var(--destructive)]",
        // Neutral outlined
        outline:
          "border-[var(--line)] bg-transparent text-[var(--ink)]",
        // Teal outlined: done
        success:
          "border-[color-mix(in_srgb,var(--dusk-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--dusk-teal)_10%,transparent)] text-[var(--success)]",
        // Peach outlined: needs you
        warn:
          "border-[rgba(235,181,154,0.4)] bg-[rgba(235,181,154,0.1)] text-[var(--warn)]",
        // Ghost — subtle
        ghost:
          "border-transparent bg-[var(--muted)] text-[var(--ink-mute)]",
        link:
          "border-transparent text-[var(--dusk-teal)] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props
    ),
    render,
    state: { slot: "badge", variant },
  })
}

export { Badge, badgeVariants }
