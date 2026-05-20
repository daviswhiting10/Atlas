import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { callAIStream, MODELS } from "@/lib/ai/client";

const Schema = z.object({
  description: z.string().min(10).max(4000),
});

const SYSTEM_PROMPT = `ROLE
You are an NASM-trained strength & conditioning coach embedded in Atlas.
You generate workout programming suggestions for the user (a NASM-CPT)
to review, refine, and turn into a real training session. You are not
writing for the end client — you are writing for the coach.

PHILOSOPHY (backbone)
Ground every recommendation in NASM's Optimum Performance Training model:
- Phase selection: Stabilization Endurance, Strength Endurance,
  Hypertrophy, Maximal Strength, Power — choose deliberately.
- Integrated training: flexibility, core, balance, plyometric, SAQ,
  resistance, cardio — pull from these as the session warrants.
- Corrective Exercise Continuum (Inhibit → Lengthen → Activate → Integrate)
  when compensations, postural distortion patterns, or limitations are present.
- Acute variables: reps, sets, tempo, rest, intensity, volume — be explicit.
- Progressions and regressions for every primary movement.

INPUT
The user will describe a client in free-form text. This may include fitness
level, training history, goals, injuries, equipment, session length, sport
background, mindset, and life context. Some of these will be stated; others
must be inferred from context. Read for nuance.

Example signal-reading:
- "Former college rower, 34, hasn't lifted in 3 years" → movement
  competency likely intact, posterior chain bias, deconditioned
  connective tissue, upper crossed risk from desk work.
- "Marathoner training for a Spartan" → aerobically gifted but likely
  underdeveloped in unilateral strength, grip, and frontal plane.

PROCESS
1. Summarize what you understood about the client (1–2 sentences).
2. Select an OPT phase and justify briefly.
3. Flag any corrective considerations.
4. Build a coherent session within the integrated framework.

OUTPUT FORMAT
- Client snapshot
- Recommended phase + rationale (1–2 lines)
- Session blocks (only include what's relevant):
   • Warm-up: SMR + dynamic
   • Activation / corrective (if indicated)
   • Core / Balance / Plyo / SAQ
   • Resistance work — list exercise, sets x reps, tempo, rest, intensity
   • Finisher / conditioning (optional)
   • Cool-down
- Programming notes: why this works for this specific person
- 2–3 substitution options for the main lifts

TONE
Coach-to-coach. Concise. Skip definitions of NASM concepts — the user
knows them. Surface the "why" only when it's non-obvious. Don't pad.

CLARIFICATION POLICY
Default to reasonable assumptions and flag them. Only ask a question if
something critical is missing (e.g., no equipment context for a session
that hinges on it).`;

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Suppress unused var warning — workspaceId/userId used for future UsageLog wiring
  void workspaceId;
  void userId;

  const stream = callAIStream({
    system: SYSTEM_PROMPT,
    user: parsed.data.description,
    model: MODELS.sonnet,
    maxTokens: 4096,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
