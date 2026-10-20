/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [solid(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: env.VITE_PROXY_TARGET || "http://localhost:8000", changeOrigin: true },
        "/health": { target: env.VITE_PROXY_TARGET || "http://localhost:8000", changeOrigin: true },
      },
    },
    build: {
      target: "es2022",
      sourcemap: true,
    },
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      server: { deps: { inline: [/solid-js/, /@solidjs/, /@kobalte/] } },
      coverage: {
        provider: "v8",
        include: ["src/domain/**", "src/api/**"],
        exclude: ["src/api/schema.d.ts", "**/*.test.ts"],
      },
    },
  };
});
