import { Request, Response, NextFunction } from "express";

import { verifyToken } from "../utils/jwt";

export interface AuthRequest extends Request {

  user?: {
    userId: string;
    role: string;
  };

}

export async function authMiddleware(

  req: AuthRequest,

  res: Response,

  next: NextFunction

) {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res.status(401).json({

        success: false,

        message: "Token manquant"

      });

    }

    const token =
      authHeader.replace(
        "Bearer ",
        ""
      );

    const decoded =
      verifyToken(token);

    req.user = decoded;

    next();

  } catch {

    return res.status(401).json({

      success: false,

      message: "Token invalide"

    });

  }

}