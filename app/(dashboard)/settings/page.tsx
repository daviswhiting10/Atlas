"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PasswordPanel } from "@/components/athlete/account";

type Profile = { name: string; email: string; voiceProfile: string; hasPassword?: boolean };

const VOICE_PLACEHOLDER = `How you coach and how you talk to clients. For example:

Direct and evidence-based. Short sentences, no filler.
I explain the why behind a block in a line or two.
I give credit when it's earned and honest feedback when it isn't.
I don't say "You've got this!" or use jargon clients won't know.`;

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-mute/70 focus:border-ink/40 disabled:bg-ink/5 disabled:text-ink-mute";

export default function SettingsPage() {
  const [saved, setSaved] = useState<Profile | null>(null);
  const [form, setForm] = useState<Profile>({ name: "", email: "", voiceProfile: "", hasPassword: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/trainer")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Profile | null) => {
        if (!p) return;
        setSaved(p);
        setForm(p);
      })
      .catch(() => toast.error("Couldn't load your profile"));
  }, []);

  const dirty = saved != null && (form.name.trim() !== saved.name || form.voiceProfile.trim() !== saved.voiceProfile.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Add your name");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/trainer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name.trim(), voiceProfile: form.voiceProfile }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Couldn't save. Please try again.");
      return;
    }
    const p: Profile = await res.json();
    setSaved(p);
    setForm(p);
    toast.success("Saved");
  }

  return (
    <div className="max-w-2xl">
      <div className="rise mb-8">
        <h1 className="text-4xl leading-none text-ink">Settings</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Your name signs the messages Atlas drafts, and your voice shapes how it writes them.
        </p>
      </div>

      <form onSubmit={save} className="rise rise-1 space-y-8">
        <section>
          <p className="eyebrow">Profile</p>
          <div className="rule mt-3 grid gap-4 pt-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} placeholder="Your name" className={field} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Email</span>
              <input value={form.email} disabled className={field} />
              <span className="mt-1 block text-xs text-ink-mute">The address you sign in with.</span>
            </label>
          </div>
        </section>

        <section>
          <p className="eyebrow">Coaching voice</p>
          <div className="rule mt-3 pt-4">
            <p className="text-[14px] leading-relaxed text-ink-soft">
              Used when Atlas drafts outreach and programs for you. The more specific, the more it sounds like you. Leave it empty for a neutral, direct voice.
            </p>
            <textarea
              value={form.voiceProfile}
              onChange={(e) => setForm({ ...form, voiceProfile: e.target.value })}
              rows={12}
              maxLength={8000}
              placeholder={VOICE_PLACEHOLDER}
              className={`${field} resize-y leading-relaxed`}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="press flex h-11 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {saved && (
        <section className="rise rise-2 mt-10">
          <p className="eyebrow">Sign-in</p>
          <PasswordPanel key={String(saved.hasPassword)} className="mt-3" email={saved.email} hasPassword={saved.hasPassword === true} />
        </section>
      )}
    </div>
  );
}
