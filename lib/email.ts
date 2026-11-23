/**
 * Sending an email through Resend. Without RESEND_API_KEY (local dev) the
 * message is printed to the server log instead.
 */

import { emailFrom } from "@/lib/email-from";

export async function sendEmail(msg: { to: string; subject: string; html: string; devNote: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n${"─".repeat(64)}\nATLAS EMAIL (set RESEND_API_KEY to send)\n  To      : ${msg.to}\n  Subject : ${msg.subject}\n  ${msg.devNote}\n${"─".repeat(64)}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: emailFrom(), to: [msg.to], subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
}
