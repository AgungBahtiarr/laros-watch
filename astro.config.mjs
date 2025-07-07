// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  security: { checkOrigin: false },
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: node({ mode: "standalone" }),
});
