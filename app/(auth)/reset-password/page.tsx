import Link from "next/link";
import { Logo } from "@/components/athlete/Logo";
import { ResetPasswordForm } from "@/components/auth/password-forms";

// The token is in the address: never send it on to another site as a referrer.
export const metadata = { title: "New password · Atlas", referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

/** Opening the page doesn't use the link up (mail scanners open links); saving does. */
export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string | string[] } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="w-full max-w-sm px-6 py-10">
      <Link href="/" aria-label="Atlas home" className="inline-block">
        <Logo />
      </Link>
      <ResetPasswordForm token={token} />
    </div>
  );
}
