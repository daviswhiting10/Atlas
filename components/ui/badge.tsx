import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // default = outlined blue
        default:
          "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue-deep)] dark:bg-[var(--blue-soft)] dark:text-blue-200",
        // secondary = outlined ink
        secondary:
          "border-[var(--line)] bg-transparent text-[var(--ink-soft)]",
        // destructive = outlined red
        destructive:
          "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
        // outline = generic outlined
        outline:
          "border-[var(--line)] bg-transparent text-[var(--ink)]",
        // success = outlined green
        success:
          "border-green-300 bg-green-50 text-[var(--success)] dark:border-green-800 dark:bg-green-950/30 dark:text-green-400",
        // warn = outlined amber
        warn:
          "border-amber-300 bg-amber-50 text-[var(--warn)] dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
        ghost:
          "border-transparent bg-[var(--muted)] text-[var(--ink-mute)]",
        link: "border-transparent text-[var(--blue)] underline-offset-4 hover:underline",
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
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
