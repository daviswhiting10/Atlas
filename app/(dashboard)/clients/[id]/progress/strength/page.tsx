import { redirect } from "next/navigation";

/** Strength charts now live on the main progress page, the same one the athlete sees. */
export default function StrengthRedirect({ params }: { params: { id: string } }) {
  redirect(`/clients/${params.id}/progress`);
}
