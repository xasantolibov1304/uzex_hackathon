import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("./client", import.meta.url));

// Frontend (React) — client/ papkasida. Dev rejimida server.js Vite'ni middleware sifatida ishlatadi
// (bitta port, HMR). Production: `npm run build` → dist/ ni server.js statik beradi.
export default defineConfig({
  root: client,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: `${client}/index.html`,
        avatarLab: `${client}/avatar-lab.html`,
        cubeLab: `${client}/cube-lab.html`,
      },
    },
  },
});
