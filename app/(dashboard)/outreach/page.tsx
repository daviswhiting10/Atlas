"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, CheckCheck } from "lucide-react";

type Template = {
  id: string;
  label: string;
  channel: string;
  body: string;
};

const TEMPLATES: Template[] = [
  {
    id: "reactivation",
    label: "Reactivation Email",
    channel: "Email",
    body: `Hi ______!

My name is Davis Whiting and I'm a Personal Trainer here at Life Time - Columbia. We are happy to see that you've come back and to make your experience even better, I'm offering you a 1h complimentary Goal Setting Session available to use during your first month of reactivation! During that session, we can talk about your health and fitness goals and I will help you make a plan to achieve them!

Let me know what day & time works best for you so we can get started!

You can reply to this email or text at 513-828-8682.

Hope to hear from you soon!

In Health,
Davis Whiting`,
  },
  {
    id: "birthday",
    label: "Birthday Email",
    channel: "Email",
    body: `Hello ______,

My name is Davis Whiting and I'm a Personal Trainer here at Life Time - Columbia.

I hope all is well with you.

First and foremost, HAPPY BIRTHDAY!!! I hope your special day is awesome!

To make it even better, as a birthday gift, I'm giving you a 1h complimentary Dynamic Personal Training Experience available to use on your account! During that session, you can inquire as to how to set up your workouts for success each time you come in.

Let me know what day & time works best for you so we can get started!

You can reply to this email or text at 513-828-8682.

Hope to hear from you soon!

In Health,
Davis Whiting`,
  },
  {
    id: "appointment_confirm",
    label: "Appointment Confirmation",
    channel: "Text — send 12–24 hrs before",
    body: `Hi _____! It's Davis from Life Time. This text is to confirm you for your 1-1 Goal Setting Session with me tomorrow at _____ AM/PM.

Please confirm by 5PM today to avoid late cancellation.`,
  },
];

function TemplateCard({ template }: { template: Template }) {
  const [body, setBody] = useState(template.body);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  function reset() {
    setBody(template.body);
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">{template.label}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{template.channel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="text-xs">
            Reset
          </Button>
          <Button size="sm" onClick={copy}>
            {copied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={body.split("\n").length + 2}
          className="font-mono text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground mt-2">Fill in the blanks (______), then copy.</p>
      </CardContent>
    </Card>
  );
}

export default function OutreachPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Edit the blanks, then copy and send.
        </p>
      </div>

      <div className="space-y-5">
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}
