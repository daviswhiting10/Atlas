/**
 * A coached client: her coach writes her plan, so the self-serve flow (starting a goal, "How it works",
 * building a plan) isn't hers. Someone who makes their own plan (a self-made account, or a coach on their own
 * training) is not. Pure: no I/O. (Later a per-client coach switch can turn the self-serve parts on.)
 */
export const isCoached = ({ selfServe, isCoach }: { selfServe: boolean; isCoach: boolean }): boolean => !selfServe && !isCoach;
