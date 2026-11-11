import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// All badges are outlined — no filled defaults.
// Badges use a tint of the signal colour, never a saturated fill.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 font-body text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[var(--blue)]/40 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // Blue outlined — primary/brand state
        default:
          "border-[rgba(30,107,78,0.30)] bg-[rgba(30,107,78,0.07)] text-[var(--blue-deep)]",
        // Ink outlined — neutral/secondary
        secondary:
          "border-[var(--line)] bg-transparent text-[var(--ink-soft)]",
        // Red outlined — error/destructive
        destructive:
          "border-[rgba(200,52,26,0.30)] bg-[rgba(200,52,26,0.06)] text-[var(--destructive)]",
        // Neutral outlined
        outline:
          "border-[var(--line)] bg-transparent text-[var(--ink)]",
        // Green outlined — success
        success:
          "border-[rgba(31,122,77,0.30)] bg-[rgba(31,122,77,0.07)] text-[var(--success)]",
        // Amber outlined — warning
        warn:
          "border-[rgba(180,83,9,0.30)] bg-[rgba(180,83,9,0.07)] text-[var(--warn)]",
        // Ghost — subtle
        ghost:
          "border-transparent bg-[var(--muted)] text-[var(--ink-mute)]",
        link:
          "border-transparent text-[var(--blue)] underline-offset-4 hover:underline",
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
