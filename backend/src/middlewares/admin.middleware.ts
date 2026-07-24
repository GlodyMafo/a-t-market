import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {

  if (!req.user) {

    return res.status(401).json({

      success: false,
      message: "Non authentifié"

    });

  }

  if (req.user.role !== "ADMIN") {

    return res.status(403).json({

      success: false,
      message: "Accès réservé aux administrateurs"

    });

  }

  next();

}