import { describe, expect, it } from "vitest";
import { isLocalDatabase, pickDatabase } from "./local";

const LOCAL = "postgresql://atlas:atlas@localhost:54329/atlas_local";
const NEON = "postgresql://u:p@ep-jolly-leaf-x.neon.tech/neondb";

describe("local database", () => {
  it("is localhost, 127.0.0.1 or ::1, nothing else", () => {
    expect(isLocalDatabase(LOCAL)).toBe(true);
    expect(isLocalDatabase("postgresql://a@127.0.0.1/x")).toBe(true);
    expect(isLocalDatabase("postgresql://a@[::1]:5432/x")).toBe(true);
    expect(isLocalDatabase(NEON)).toBe(false);
    expect(isLocalDatabase("postgresql://a@localhost.evil.com/x")).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
    expect(isLocalDatabase(undefined)).toBe(false);
  });
  it("scripts default to local when DATABASE_URL_LOCAL is set", () => {
    expect(pickDatabase([], { DATABASE_URL: NEON, DATABASE_URL_LOCAL: LOCAL })).toEqual({ which: "local", url: LOCAL });
    expect(pickDatabase(["--db", "neon"], { DATABASE_URL: NEON, DATABASE_URL_LOCAL: LOCAL })).toEqual({ which: "neon", url: NEON });
    expect(pickDatabase([], { DATABASE_URL: NEON })).toEqual({ which: "neon", url: NEON });
  });
  it("asking for local without it set, or set to a remote host, is an error (never a quiet fall back to Neon)", () => {
    expect(() => pickDatabase(["--db", "local"], { DATABASE_URL: NEON })).toThrow(/DATABASE_URL_LOCAL is not set/);
    expect(() => pickDatabase([], { DATABASE_URL: NEON, DATABASE_URL_LOCAL: NEON })).toThrow(/must point at this machine/);
    expect(() => pickDatabase(["--db", "prod"], { DATABASE_URL: NEON })).toThrow(/local or neon/);
  });
});
