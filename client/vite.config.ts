import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // top-level await in main.ts requires a target that supports it
    target: ["chrome89", "edge89", "firefox89", "safari15"],
  },
});
