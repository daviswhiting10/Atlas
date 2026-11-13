import { cookies } from "next/headers";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { safeTimeZone } from "@/lib/athlete/sessions";
import { dayToDate } from "./day";

/** A picked day (YYYY-MM-DD) from this request's user, as the instant to store: noon in their timezone. */
export function requestDay(day: string): Date {
  return dayToDate(day, safeTimeZone(cookies().get(TZ_COOKIE)?.value));
}
