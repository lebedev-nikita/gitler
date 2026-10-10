import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { browserDev } from "./scripts/browser-dev.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), browserDev()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 1420, strictPort: true },
  clearScreen: false,
});
