import type { NextFunction, Request, Response } from "express";
import { getSession } from "../services/sessionService.js";

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);

  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  res.locals.session = session;
  next();
}
