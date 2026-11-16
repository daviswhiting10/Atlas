import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-[var(--input)] bg-[var(--dusk-raised)] px-2.5 py-2 font-body text-base text-[var(--ink)] transition-colors outline-none placeholder:text-[var(--ink-mute)] focus-visible:border-[var(--dusk-teal)] focus-visible:ring-3 focus-visible:ring-[var(--dusk-teal)]/25 disabled:cursor-not-allowed disabled:bg-[var(--muted)] disabled:opacity-50 aria-invalid:border-[var(--destructive)] aria-invalid:ring-3 aria-invalid:ring-[var(--destructive)]/25 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
