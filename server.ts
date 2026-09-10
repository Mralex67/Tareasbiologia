import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import apiApp from "./artifacts/api-server/src/app";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Mount API backend
  app.use(apiApp);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), "artifacts/tareas/vite.config.ts"),
      root: path.resolve(process.cwd(), "artifacts/tareas"),
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "artifacts/tareas/dist/public");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
