import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 font-body text-base text-[var(--ink)] transition-colors outline-none placeholder:text-[var(--ink-mute)] focus-visible:border-[var(--blue)] focus-visible:ring-3 focus-visible:ring-[var(--blue)]/20 disabled:cursor-not-allowed disabled:bg-[var(--muted)] disabled:opacity-50 aria-invalid:border-red-400 aria-invalid:ring-3 aria-invalid:ring-red-400/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
