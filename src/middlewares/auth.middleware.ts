import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";

export type AuthJwtPayload = {
  id: number;
  nombre: string;
  email: string;
};

// Nunca uses "dev_secret" en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET no está definido en variables de entorno");
  process.exit(1); // Forzamos fallo al arrancar
}


declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
      token?: string;
    }
  }
}

/**
 * Middleware principal para proteger rutas con Access Token.
 * - Requiere header: Authorization: Bearer <token>
 * - Valida firma y expiración del token
 * - Inyecta `req.user` y `req.token`
 */
export const authGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado (falta token)" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthJwtPayload;

    // Inyectar en req
    req.user = payload;
    req.token = token;

    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "Sesión expirada, refresca el token" });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Token inválido" });
    }
    return res.status(401).json({ error: "No autorizado" });
  }
};