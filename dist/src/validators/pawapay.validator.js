"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pawapayWebhookSchema = void 0;
const zod_1 = require("zod");
// Seul le depositId est exigé : le reste du contenu n'est jamais utilisé pour décider.
exports.pawapayWebhookSchema = zod_1.z
    .object({
    depositId: zod_1.z.string().uuid(),
})
    .passthrough();
