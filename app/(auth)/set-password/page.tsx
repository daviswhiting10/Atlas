import { redirect } from "next/navigation";
import { Logo } from "@/components/athlete/Logo";
import { auth } from "@/lib/auth";
import { SetPasswordStep } from "@/components/auth/password-forms";

export const metadata = { title: "Set a password · Atlas" };
export const dynamic = "force-dynamic";

/** The set-password step. Middleware sends accounts here while session.user.needsPassword is set. */
export default async function SetPasswordPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  return (
    <div className="w-full max-w-sm px-6 py-10">
      <Logo />
      <SetPasswordStep email={session.user.email} canSnooze={session.user.canSnoozePassword === true} />
    </div>
  );
}
