import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/…" alias the app uses (tsconfig paths).
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "") },
  },
  // Components are JSX; tsconfig leaves JSX for Next, so tests compile it here (render tests use react-dom/server).
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["lib/**/*.test.ts"] },
});
