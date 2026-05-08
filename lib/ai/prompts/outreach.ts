export type OutreachInput = {
  clientName: string;
  clientStatus: string;
  primaryGoal?: string | null;
  recentContext?: string;
  purpose: string;
  channel: string;
  trainerVoice?: string | null;
  methodology?: string;
};

const PURPOSE_GUIDANCE: Record<string, string> = {
  cold_outreach:
    "First touchpoint. Be specific about why you're reaching out. Mention something you observed or know about them. Do not pitch hard on first contact.",
  check_in:
    "Genuine check-in on their progress/how they're feeling. Brief. No hard sell.",
  win_back:
    "Client has churned. Acknowledge the gap without guilt-tripping. Give them a reason to come back. One clear CTA.",
  retention_nudge:
    "Client is at risk of churning. Warm, direct. Acknowledge any gap in sessions. Make it easy for them to re-engage.",
  post_consult:
    "Follow up after a consultation/trial session. Reference something specific from the session. Clear next step.",
  referral_ask:
    "Ask for a referral from a happy active client. Make it easy and specific.",
};

export function buildOutreachPrompt(input: OutreachInput) {
  const methodology = input.methodology ?? "";

  const voiceSection = input.trainerVoice
    ? `## Trainer Voice\n${input.trainerVoice}`
    : `## Trainer Voice\nDavis Whiting — NASM CPT. Direct, evidence-based, no fluff. Sharp but warm. Not a Planet Fitness coach.`;

  return {
    system: `You are writing an outreach message for Davis Whiting, a personal trainer.

${voiceSection}

${methodology ? `## Methodology Context\n${methodology}` : ""}

## Hard rules
- Sound like a real person, not a template. No "Hope this finds you well."
- Channel-appropriate length: Email = 3-5 sentences. SMS = 1-2 sentences. DM = conversational, brief.
- Personalize using everything you know about this client.
- One clear call to action max.
- Never be sycophantic. Never be pushy.
- Output ONLY the message text. No subject line unless it's an email (then include "Subject: " on line 1).`,
    user: `Write a ${input.channel} message for this client.

Client: ${input.clientName}
Status: ${input.clientStatus}
${input.primaryGoal ? `Goal: ${input.primaryGoal.replace("_", " ")}` : ""}
${input.recentContext ? `Context: ${input.recentContext}` : ""}

Purpose: ${PURPOSE_GUIDANCE[input.purpose] ?? input.purpose}`,
  };
}
