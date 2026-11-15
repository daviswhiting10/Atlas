import Link from "next/link";
import { Logo } from "@/components/athlete/Logo";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata = { title: "Forgot password · Atlas" };

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm px-6 py-10">
      <Link href="/" aria-label="Atlas home" className="inline-block">
        <Logo />
      </Link>
      <ForgotPasswordForm />
    </div>
  );
}
