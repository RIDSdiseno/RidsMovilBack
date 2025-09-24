// src/middlewares/authGuard.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

// Si quieres tipar lo que lleva el JWT:
export type AuthJwtPayload = {
  id: number;
  email: string;
  nombre: string;
};

// Extiende Express.Request para tener req.user (opcional pero útil)
declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
      token?: string;
    }
  }
}

/**
 * Middleware que exige Access Token en Authorization: Bearer <token>
 * Valida firma/expiración y coloca el payload en req.user
 */
export const authGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sin token de acceso" });
  }

  const token = h.slice(7);

  try {
    const payload = verifyAccessToken(token) as AuthJwtPayload;
    req.user = payload;
    req.token = token;
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

/**
 * Variante opcional: deja pasar sin token, pero si existe y es válido, rellena req.user.
 * Útil para endpoints públicos con info adicional si el usuario está logueado.
 */
export const authGuardOptional: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) {
    const token = h.slice(7);
    try {
      const payload = verifyAccessToken(token) as AuthJwtPayload;
      req.user = payload;
      req.token = token;
    } catch {
      // ignoramos errores, sigue como anónimo
    }
  }
  return next();
};

export default authGuard;
