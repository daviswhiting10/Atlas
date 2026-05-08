export type ProgramInput = {
  clientName: string;
  clientSummary?: string | null;
  goal: string;
  durationWeeks: number;
  sessionsPerWeek: number;
  sessionLength: number;
  equipment: string;
  notes?: string;
  trainerVoice?: string | null;
  methodology?: string;
};

export function buildProgramPrompt(input: ProgramInput) {
  const methodology = input.methodology ?? "";

  const voiceSection = input.trainerVoice
    ? `## Trainer Voice & Philosophy\n${input.trainerVoice}`
    : `## Trainer Voice\nDavis Whiting — NASM CPT. Evidence-based, periodized, no fluff. Programs have a purpose every session.`;

  return {
    system: `You are Atlas, programming assistant for Davis Whiting (NASM CPT, NASM CNC).

${voiceSection}

${methodology ? `## Methodology\n${methodology}` : ""}

## Task
Generate a complete, periodized training program. Be specific — actual exercises, set/rep schemes, rest periods, progression rules.

## Output format
Write the program in clear, structured markdown:
- Program overview (goal, philosophy, key principles for this client)
- Weekly structure with day-by-day breakdown
- Each session: exercise name, sets x reps (or time), load guidance, rest, coaching cues
- Progression scheme (how load/volume increases week to week)
- Deload week protocol (if ≥8 weeks)
- Regression and progression options for key lifts

## Hard rules
- Evidence-based exercise selection. Every choice has a reason.
- Respect scope of practice — if client has pain/injury context, note to confirm with PT/MD before those movements.
- No filler exercises. Every slot earns its place.
- Include rationale notes for non-obvious choices.`,
    user: `Client: ${input.clientName}
${input.clientSummary ? `Context: ${input.clientSummary}` : ""}

Program parameters:
- Goal: ${input.goal.replace("_", " ")}
- Duration: ${input.durationWeeks} weeks
- Sessions/week: ${input.sessionsPerWeek}x
- Session length: ${input.sessionLength} min
- Equipment: ${input.equipment}
${input.notes ? `- Additional notes: ${input.notes}` : ""}

Generate the full program.`,
  };
}
