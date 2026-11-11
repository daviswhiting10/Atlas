import type { Prisma } from "@/app/generated/prisma/client";

/**
 * A coach's own training lives on a client profile linked to their coach
 * login ("My training"). It is not a client: every roster, count and list on
 * the coach side leaves it out with this filter.
 */
export const ROSTER: Prisma.ClientProfileWhereInput = {
  OR: [{ userId: null }, { user: { role: "CLIENT" } }],
};
