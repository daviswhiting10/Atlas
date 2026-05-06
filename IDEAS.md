# Ideas Parking Lot

Ideas that came up during build but weren't requested. Ask before building any of these.

---

## Potential Future Features

- **Session replay**: record actual audio during sessions, not just post-session notes
- **Exercise library**: searchable DB of exercises with video links, cues, regressions/progressions — feed into program generator as structured context
- **Client portal**: read-only view clients can access on their phone to see their program
- **Progress photos**: structured before/after comparison with AI body composition notes (scope-of-practice careful)
- **Smart scheduling**: detect session cadence drift before retention score drops
- **Referral network**: track which clients referred others; auto-generate referral ask messages
- **Canva integration**: auto-generate branded program PDFs using Canva API
- **Wearable sync**: pull HRV / sleep from Apple Health or Whoop as retention signal inputs

## Architecture Notes

- When adding multi-user: methodology folder should move to per-trainer storage (S3 or DB)
- Second Brain embeddings: consider switching from Bytes in SQLite to a proper vector store (pgvector, Chroma) when moving to Postgres in Phase 4
