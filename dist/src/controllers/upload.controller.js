"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_DIR = void 0;
exports.uploadImageController = uploadImageController;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
/** Dossier des images (à placer sur un disque persistant en production). */
exports.UPLOAD_DIR = node_path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "uploads");
const FORMATS = [
    { ext: "jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: "png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    {
        ext: "webp",
        matches: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
    },
];
async function uploadImageController(req, res) {
    const body = req.body;
    const bad = { success: false, message: "Envoyez une image JPEG, PNG ou WebP de 5 Mo au maximum." };
    if (!Buffer.isBuffer(body) || body.length === 0)
        return res.status(400).json(bad);
    const format = FORMATS.find((f) => f.matches(body));
    if (!format)
        return res.status(400).json(bad);
    try {
        await (0, promises_1.mkdir)(exports.UPLOAD_DIR, { recursive: true });
        const name = `${(0, node_crypto_1.randomUUID)()}.${format.ext}`;
        await (0, promises_1.writeFile)(node_path_1.default.join(exports.UPLOAD_DIR, name), body, { flag: "wx" });
        return res.status(201).json({ success: true, data: { url: `/uploads/${name}` } });
    }
    catch {
        return res.status(500).json({ success: false, message: "L'image n'a pas pu être enregistrée." });
    }
}
