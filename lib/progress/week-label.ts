/**
 * Labels for the all-lifts line, which has one point per week keyed on that week's Monday. Saying "Week of" keeps a
 * Monday's date from reading as the day of the latest session ("Nov 23" on a Tuesday). Single-lift charts show each
 * session's own date. Pure.
 */
import { format, parseISO } from "date-fns";

export const weekOf = (monday: string) => `Week of ${format(parseISO(monday), "MMM d")}`;
