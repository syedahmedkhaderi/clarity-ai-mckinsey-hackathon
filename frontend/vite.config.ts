import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// start.sh picks the backend port; the default matches its own default.
const apiPort = process.env.LOOP_API_PORT || "8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
});
