"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRefreshCookie = setRefreshCookie;
exports.clearRefreshCookie = clearRefreshCookie;
const SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const SAME_SITE = process.env.COOKIE_SAMESITE ?? "lax";
const DOMAIN = process.env.COOKIE_DOMAIN || undefined;
function setRefreshCookie(res, rt, days) {
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
function clearRefreshCookie(res) {
    res.clearCookie("rt", {
        httpOnly: true,
        secure: SECURE,
        sameSite: SAME_SITE,
        domain: DOMAIN,
        path: "/auth",
    });
}
