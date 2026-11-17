import { redirect } from "next/navigation";

/**
 * New plans start on the client's page now (Plan tab: Import plan, From your
 * library, Build with Atlas). Old links land there, or on the roster.
 */
export default function NewPlanPage({ searchParams }: { searchParams: { client?: string } }) {
  const client = searchParams.client;
  redirect(client && /^[a-z0-9]{10,40}$/i.test(client) ? `/clients/${client}?tab=build` : "/clients");
}
