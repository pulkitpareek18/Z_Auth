import { Router } from "express";
import { pool } from "../db/pool.js";

export const healthRouter = Router();

healthRouter.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

healthRouter.get("/health/deps", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ postgres: "ok" });
  } catch {
    res.status(503).json({ postgres: "error" });
  }
});
