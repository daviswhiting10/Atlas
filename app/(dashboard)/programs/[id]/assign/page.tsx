import { redirect } from "next/navigation";

/** Assigning now happens on the program page, as a draft the coach edits first. */
export default function AssignRedirect({ params }: { params: { id: string } }) {
  redirect(`/programs/${params.id}`);
}
