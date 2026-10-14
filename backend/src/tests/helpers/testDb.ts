import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { TEST_DB_PORT } from "../setup";

let db: PGlite;
let socketServer: PGLiteSocketServer;

/**
 * Démarre une vraie base PostgreSQL en mémoire (PGlite) et y applique
 * tes migrations Prisma réelles. Aucune installation de PostgreSQL requise.
 */
export async function startTestDb() {
  db = await PGlite.create();

  const migrationsDir = path.join(__dirname, "../../../prisma/migrations");
  const folders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of folders) {
    await db.exec(
      fs.readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8")
    );
  }

  socketServer = new PGLiteSocketServer({
    db,
    port: TEST_DB_PORT,
    maxConnections: 10,
    host: "127.0.0.1",
  });
  await socketServer.start();
}

export async function resetTestDb() {
  await db.exec('TRUNCATE TABLE "User", "Product" RESTART IDENTITY CASCADE');
}

export async function stopTestDb() {
  await socketServer.stop();
  await db.close();
}