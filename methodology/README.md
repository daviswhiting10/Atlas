# Methodology Folder

These files define how Atlas generates programs, corrective protocols, nutrition guidance, and client communication. They are injected into every AI system prompt at runtime.

## Format

Each file uses YAML frontmatter followed by markdown content:

```markdown
---
title: Program Design Framework
appliesTo: [program, corrective, session]
---

Your methodology content here...
```

### `appliesTo` values

| Value | Used in |
|---|---|
| `program` | Program generator |
| `corrective` | Corrective exercise tool |
| `session` | Session note structuring |
| `nutrition` | Nutrition guidance |
| `outreach` | Client communication / voice |
| `intake` | Intake form extraction |

If `appliesTo` is empty (`[]`), the file is included in all prompts.

## Files

| File | Description |
|---|---|
| `00-voice-and-philosophy.md` | Davis's training voice, what he says / doesn't say |
| `01-program-design-framework.md` | Exercise selection, structure, programming logic |
| `02-periodization.md` | Progression models, deloads, periodization schemes |
| `03-corrective-exercise.md` | NASM CES: inhibit → lengthen → activate → integrate |
| `04-nutrition.md` | NASM CNC: macros, meal timing, client coaching |
| `05-population-templates.md` | Weight loss, hypertrophy, pain mgmt, performance |
| `06-scope-of-practice.md` | CPT scope, referral triggers, red-flag conditions |

## Notes

- Loader skips files that are empty or contain only `<!-- TODO -->` placeholders.
- Changing any file invalidates the Second Brain few-shot cache (methodology hash changes).
- Keep entries evidence-based and practical — these are operational instructions for an AI trainer, not textbook prose.
