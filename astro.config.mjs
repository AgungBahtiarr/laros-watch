// @ts-check
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import vitePWA from "@vite-pwa/astro";

import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  site: "https://watch.1dev.win",
  security: { checkOrigin: false },
  output: "server",
  integrations: [
    svelte(),
    vitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
      manifest: {
        name: "Laros Watch",
        short_name: "LarosWatch",
        description: "Satpamnya laros",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      chunkSizeWarningLimit: 1000,
    },
  },

  adapter: node({
    mode: "standalone",
  }),
});
