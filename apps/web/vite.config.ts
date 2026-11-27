import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": server,
      "/uploads": server,
      "/socket.io": { target: server, ws: true },
    },
  },
});
