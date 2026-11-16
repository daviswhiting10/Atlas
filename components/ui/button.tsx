import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-body text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-[var(--dusk-teal)]/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-[var(--destructive)]/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The primary action is the one bright button (Dusk); teal marks progress and state.
        default:
          "bg-[var(--dusk-button)] text-[var(--dusk-button-text)] hover:bg-[color-mix(in_srgb,var(--dusk-button)_88%,transparent)]",
        outline:
          "border-[var(--dusk-line-strong)] bg-transparent text-[var(--ink)] hover:bg-[rgba(236,232,225,0.06)]",
        secondary:
          "bg-[rgba(124,199,189,0.12)] text-[var(--dusk-teal)] hover:bg-[rgba(124,199,189,0.2)]",
        ghost:
          "hover:bg-[rgba(236,232,225,0.06)] text-[var(--ink-soft)] hover:text-[var(--ink)]",
        destructive:
          "bg-[rgba(242,135,122,0.12)] text-[var(--destructive)] hover:bg-[rgba(242,135,122,0.2)]",
        link:
          "text-[var(--dusk-teal)] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 max-md:h-11 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 max-md:h-11 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 max-md:h-11 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 max-md:h-11 gap-1.5 px-3",
        icon: "size-8 max-md:size-11",
        "icon-xs": "size-6 max-md:size-11 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 max-md:size-11 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9 max-md:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
