import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  isSupabaseConfigured,
  isSupabasePartiallyConfigured,
  getSupabaseDiagnostics,
} from "../lib/supabase";

const router: IRouter = Router();

router.get(["/healthz", "/health"], (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/db-status", (_req, res) => {
  const supabase = isSupabaseConfigured();
  const partial = isSupabasePartiallyConfigured();
  const diag = getSupabaseDiagnostics();
  const hasPg = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL);
  res.json({
    activeDatabase: supabase ? "Supabase (Nube)" : hasPg ? "PostgreSQL (Direct)" : "En memoria (Local)",
    isSupabase: supabase,
    isPartial: partial,
    diagnostics: diag,
  });
});

export default router;
