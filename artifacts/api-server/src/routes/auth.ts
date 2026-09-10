import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse, GetCurrentSessionResponse } from "@workspace/api-zod";
import { createSession, getSession } from "../lib/session";

const router: IRouter = Router();

function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

router.post("/auth/login", (req, res): void => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Introduce una contraseña válida." });
    return;
  }

  const session = createSession(parsed.data.password);
  if (!session) {
    res.status(401).json({ error: "La contraseña no es correcta." });
    return;
  }

  res.json(LoginResponse.parse(session));
});

router.get("/auth/me", (req, res): void => {
  const session = getSession(readBearerToken(req.headers.authorization));
  if (!session) {
    res.status(401).json({ error: "La sesión no es válida." });
    return;
  }

  res.json(GetCurrentSessionResponse.parse(session));
});

export default router;