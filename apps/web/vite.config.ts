import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
const backendOrigin =
  process.env.CRICKET_SERVER_ORIGIN ?? "http://127.0.0.1:3001";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "AuctionPlay",
        short_name: "AuctionPlay",
        description: "Your friends. Your franchise. Your auction.",
        theme_color: "#100b18",
        background_color: "#0d0913",
        display: "standalone",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,ttf}"],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": backendOrigin,
      "/socket.io": { target: backendOrigin, ws: true },
    },
  },
});
