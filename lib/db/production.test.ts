import { describe, expect, it } from "vitest";
import { isProductionDatabase } from "./production";

const url = (host: string, db = "neondb") => `postgresql://u:p@${host}.c-7.us-east-1.aws.neon.tech/${db}?sslmode=require`;

describe("isProductionDatabase", () => {
  it("knows the production endpoint, pooled or not", () => {
    expect(isProductionDatabase(url("ep-nameless-field-abc123"), {})).toBe(true);
    expect(isProductionDatabase(url("ep-nameless-field-abc123-pooler"), {})).toBe(true);
  });

  it("treats a URL equal to PROD_DATABASE_URL as production", () => {
    expect(isProductionDatabase(url("ep-other-1-pooler"), { PROD_DATABASE_URL: url("ep-other-1") })).toBe(true);
  });

  it("lets branches and local databases through", () => {
    expect(isProductionDatabase(url("ep-jolly-leaf-apv4cl7w-pooler"), {})).toBe(false);
    expect(isProductionDatabase("postgresql://localhost:5432/atlas", {})).toBe(false);
  });

  it("refuses on Vercel production and on an unreadable URL", () => {
    expect(isProductionDatabase(url("ep-x"), { VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDatabase("not a url", {})).toBe(true);
  });
});
