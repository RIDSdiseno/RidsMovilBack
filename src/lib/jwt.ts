import jwt from "jsonwebtoken";
import type { Secret } from "jsonwebtoken";

const JWT_SECRET: Secret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no está definido en variables de entorno");
  return secret;
})();
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 900); // 15m

export type JwtPayload = {
  id: number;
  email: string;
  nombre: string;
};

export function signAccessToken(
  payload: JwtPayload,
  expiresInSec = ACCESS_EXPIRES_SEC
) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
