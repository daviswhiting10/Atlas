export function buildProgramImportPrompt(imageCount: number, notes?: string) {
  const multiDay = imageCount > 1;

  return {
    system: `You are Atlas, a workout-programming assistant. Your job is to parse ${multiDay ? `${imageCount} screenshots of a workout plan` : "a screenshot of a workout plan"} and return a JSON representation of the program.

## Output format
Respond ONLY with valid JSON — no markdown fences, no explanation text, just the raw JSON object.

The JSON must follow this exact structure:
{
  "programName": string,
  "description": string,
  "durationWeeks": number,
  "days": [
    {
      "name": string,
      "dayOfWeek": number,
      "sections": [
        {
          "name": string,
          "exercises": [
            {
              "name": string,
              "sets": number,
              "repMin": number,
              "repMax": number,
              "unit": "reps" | "secs",
              "loadNote": string,
              "tempo": string,
              "restSeconds": number | null,
              "notes": string
            }
          ]
        }
      ]
    }
  ]
}

## Field rules
- **programName**: infer a short name from the day labels and goals (e.g. "Lower Body Power Block").
- **durationWeeks**: 1 unless the screenshots indicate a multi-week programme.
- **days**: ${multiDay ? `one entry per screenshot — each image is a separate training day` : "one entry per training day shown"}.
- **name**: use the day label exactly as written in the screenshot (e.g. "Monday", "Thursday", "Day A"). If no label, use "Day 1", "Day 2", etc.
- **dayOfWeek**: derive from the day label. Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6 Sun=7. If ambiguous, space days evenly starting at 1.
- **sections**: labeled groups within a day (e.g. "Block A", "Block B", "Warmup"). If no labeled sections, use one section named "Main".
- **sets**: number of working sets for the exercise.
- **repMin / repMax**: if a single number (e.g. "15"), set both to 15. If a range (e.g. "8–12"), split them. Time-based (e.g. "30 sec"): unit="secs", repMin=repMax=30.
- **loadNote**: any load/intensity guidance (e.g. "Light band", "BW", "Moderate cable"). Empty string if none.
- **tempo**: tempo prescription if stated, else "".
- **restSeconds**: rest in seconds if stated, else null.
- **notes**: coaching notes or purpose notes from the plan.

## Hard rules
- Capture EVERY exercise shown, in the order they appear.
- Preserve section groupings exactly as shown.
- Do NOT invent exercises not visible in the images.`,
    user: multiDay
      ? `${imageCount} training day screenshots follow (one day per image, in order). Parse each image as a separate day entry. Use the day label visible in each image to set the name and dayOfWeek.${notes ? `\n\nAdditional context: ${notes}` : ""}`
      : `Parse the workout plan in this image.${notes ? `\n\nAdditional context: ${notes}` : ""}`,
  };
}

/**
 * The same output as the screenshot import, read from a spreadsheet
 * exported as CSV. Coaches lay sheets out every which way, so the model
 * reads the content, not fixed columns.
 */
export function buildProgramSheetPrompt(csv: string, notes?: string) {
  const { system } = buildProgramImportPrompt(1);
  return {
    system: system
      .replace("parse a screenshot of a workout plan", "read a coach's workout plan from a spreadsheet (given as CSV)")
      .replace(
        "- **durationWeeks**: 1 unless the screenshots indicate a multi-week programme.",
        "- **durationWeeks**: how many weeks the plan runs. If the sheet repeats the same workouts across several weeks (week columns, week tabs or week headings), use that number of weeks and the first week's prescription."
      )
      .replace(
        "- **name**: use the day label exactly as written in the screenshot",
        "- **name**: use the day or workout label exactly as written in the sheet"
      )
      .replace("- Do NOT invent exercises not visible in the images.", "- Do NOT invent exercises that aren't in the sheet.\n- Ignore rows that aren't exercises: titles, totals, blank rows, the client's name, dates, notes to self.\n- Rows and columns may be in any order; read the sheet like a coach would."),
    user: `The spreadsheet, as CSV:\n\n${csv}${notes ? `\n\nAdditional context: ${notes}` : ""}`,
  };
}
