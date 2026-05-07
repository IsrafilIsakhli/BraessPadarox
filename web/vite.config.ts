import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "interfluvial-unshielding-delisa.ngrok-free.dev",
      ".ngrok-free.dev",
      ".ngrok.app"
    ]
  }
});
