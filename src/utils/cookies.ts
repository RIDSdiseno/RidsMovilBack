import type { Response } from "express";

// Por defecto, cookies seguras (HTTPS) en producción; en dev (http) quedan
// no-seguras. Se puede forzar con COOKIE_SECURE.
const SECURE = process.env.COOKIE_SECURE != null
  ? String(process.env.COOKIE_SECURE) === "true"
  : process.env.NODE_ENV === "production";
const SAME_SITE = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") ?? "lax";
const DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export function setRefreshCookie(res: Response, rt: string, days: number) {
  const maxAge = days * 24 * 60 * 60 * 1000;
  res.cookie("rt", rt, {
    httpOnly: true,
    secure: SECURE,
    sameSite: SAME_SITE,
    domain: DOMAIN,
    maxAge,
    path: "/auth", // limita el scope del RT a /auth
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie("rt", {
    httpOnly: true,
    secure: SECURE,
    sameSite: SAME_SITE,
    domain: DOMAIN,
    path: "/auth",
  });
}
