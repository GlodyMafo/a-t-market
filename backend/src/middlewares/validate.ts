import { Request, Response, NextFunction } from "express";
import { z } from "zod";

type Schemas = { body?: z.ZodType; params?: z.ZodType };

function lignes(where: "body" | "params", error: z.ZodError) {
  return error.issues.map((issue) => ({
    where,
    path: issue.path.map(String).join("."),
    message:
      issue.code === "unrecognized_keys"
        ? `Champ(s) non autorisé(s) : ${issue.keys.join(", ")}`
        : issue.message,
  }));
}

/** Valide body et/ou params. En cas de succès, req.body est remplacé par la version nettoyée. */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ReturnType<typeof lignes> = [];

    if (schemas.body) {
      const r = schemas.body.safeParse(req.body ?? {});
      if (r.success) req.body = r.data;
      else errors.push(...lignes("body", r.error));
    }

    if (schemas.params) {
      const r = schemas.params.safeParse(req.params);
      if (!r.success) errors.push(...lignes("params", r.error));
    }

    if (errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Données invalides", errors });
    }
    next();
  };
}