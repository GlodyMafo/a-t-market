import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";

/** Dossier des images (à placer sur un disque persistant en production). */
export const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads");

const FORMATS = [
  { ext: "jpg", matches: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", matches: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    ext: "webp",
    matches: (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

export async function uploadImageController(req: Request, res: Response) {
  const body: unknown = req.body;
  const bad = { success: false, message: "Envoyez une image JPEG, PNG ou WebP de 5 Mo au maximum." };

  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json(bad);
  const format = FORMATS.find((f) => f.matches(body));
  if (!format) return res.status(400).json(bad);

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${randomUUID()}.${format.ext}`;
    await writeFile(path.join(UPLOAD_DIR, name), body, { flag: "wx" });
    return res.status(201).json({ success: true, data: { url: `/uploads/${name}` } });
  } catch {
    return res.status(500).json({ success: false, message: "L'image n'a pas pu être enregistrée." });
  }
}