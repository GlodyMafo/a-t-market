import { z } from "zod";

// Seul le depositId est exigé : le reste du contenu n'est jamais utilisé pour décider.
export const pawapayWebhookSchema = z
  .object({
    depositId: z.string().uuid(),
  })
  .passthrough();