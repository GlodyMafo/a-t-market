import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// Le serveur tourne.
router.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "A&T Market API",
  });
});

// Le serveur tourne ET la base de données répond.
router.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "ok" });
  } catch {
    // Aucun détail interne n'est renvoyé au client.
    console.error("HEALTH READY : base de données injoignable");
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

export default router;