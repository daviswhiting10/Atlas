/**
 * What a password form says when it can't go on. A plain error is red. A WARNING ("This looks easy to guess") is a quiet grey and comes with "Use it anyway": the person's account, the person's call.
 */
export function Problem({ text, weak, onUseAnyway, busy }: { text: string | null; weak?: boolean; onUseAnyway?: () => void; busy?: boolean }) {
  if (!text) return null;
  return (
    <div role="alert" className="space-y-2">
      <p className={weak ? "text-sm leading-relaxed text-ink-soft" : "text-sm leading-relaxed text-destructive"}>{text}</p>
      {weak && onUseAnyway && (
        <button type="button" onClick={onUseAnyway} disabled={busy} className="press inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4 disabled:opacity-60">
          Use it anyway
        </button>
      )}
    </div>
  );
}
