import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        // analyze can run several minutes (Whisper + embeddings)
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
});
