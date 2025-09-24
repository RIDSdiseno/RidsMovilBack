import type { Request, Response } from "express";
import { EstadoVisita, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Secret } from "jsonwebtoken";
import crypto from "crypto";

const prisma = new PrismaClient
/* =========================
   CONFIG / CONSTANTES
========================= */

// JWT para Access Token (corto)
const JWT_SECRET: Secret = process.env.JWT_SECRET ?? "dev_secret"; // ⚠️ cambia en prod
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 15 * 60); // 15 min

// Refresh Token (cookie) duración
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS ?? 7);                   // sin "recordarme"
const REFRESH_REMEMBER_DAYS = Number(process.env.REFRESH_REMEMBER_DAYS ?? 60); // con "recordarme"

// Cookies (ajusta en prod)
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") ?? "lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
// 👇 muy importante si tus rutas están bajo /api/auth
const COOKIE_PATH = process.env.COOKIE_PATH ?? "/api/auth";


/* =========================
   TIPOS
========================= */
type JwtPayload = {
  id: number;
  email: string;       // derivado de nivel
  nombreUsuario: string;
};


/* =========================
   HELPERS
========================= */

// Access Token (JWT)
function signAccessToken(payload: JwtPayload, expiresInSec = ACCESS_EXPIRES_SEC) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}

// Refresh Token aleatorio + hash SHA-256 (se guarda sólo el hash)
function generateRT(): string {
  return crypto.randomBytes(64).toString("base64url");
}
function hashRT(rt: string): string {
  return crypto.createHash("sha256").update(rt).digest("hex");
}

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function parseRemember(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

function setRefreshCookie(res: Response, rt: string, days: number) {
  const maxAge = days * 24 * 60 * 60 * 1000;
  res.cookie("rt", rt, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    maxAge,
    path: COOKIE_PATH, // <- clave para que el navegador/cliente la envíe a /api/auth/*
  });
}
function clearRefreshCookie(res: Response) {
  res.clearCookie("rt", {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: COOKIE_PATH,
  });
}

/* =========================
   CONTROLADORES
========================= */

//POST Auth/register
export const registerUser = async(req:Request,res:Response)=>{
  try{
    const { nombre, email, password } = req.body;

    //validaciones basicas
    if(!nombre || !email || !password ){
      return res.status(400).json({ error: "Todos los campos son obligatorios"})
    }

    //Se normaliza el email
    const emailNorm = String(email).trim().toLowerCase();
    const existing = await prisma.tecnico.findUnique({ where: {email: emailNorm}});
    if(existing) return res.status(409).json({ error: "Usuario ya existe" });

    const passwordHash = await bcrypt.hash(password,10);
    const newUser = await prisma.tecnico.create({
      data:{
        nombre,
        email: emailNorm,
        passwordHash,
        status: true
      },
      select: {id:true,nombre:true,email:true},
    });
    return res.status(201).json({ user:newUser });
  } catch(error){
    console.error("Register error", error);
    return res.status(500).json({error: "Error interno" });
  }
  
};

//POST /auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, remember } = req.body as {
      email?: string;
      password?: string;
      remember?: boolean;
    };

    if (!email || !password) {
      return res.status(400).json({ error: "Correo y contraseña son obligatorios" });
    }

    const emailNorm = email.trim().toLowerCase();
    const user = await prisma.tecnico.findUnique({
      where: { email: emailNorm },
      select: {
        id: true,
        nombre: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user || !user.status) {
      // Dummy compare para timing safe
      await bcrypt.compare(password, "$2b$10$invalidinvalidinvalidinvalidinv12345678901234567890");
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });



    // 1) Access Token (corto)
    const at = signAccessToken({
      id: user.id,
      email: user.email,
      nombreUsuario: user.nombre,
    });

    // 2) Refresh Token (cookie httpOnly) + registro en DB
    const rememberFlag = Boolean(remember);
    const days = rememberFlag ? REFRESH_REMEMBER_DAYS : REFRESH_DAYS;

    const rt = generateRT();         // valor que va a cookie
    const rtDigest = hashRT(rt);     // hash que guardamos en DB

    // userAgent / ip como string | null (no undefined)
    const userAgent: string | null = req.get("user-agent") ?? null;
    const ip: string | null = (req.ip ?? req.socket?.remoteAddress ?? null) as string | null;

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        rtHash: rtDigest,
        expiresAt: addDays(days),
        userAgent, // string | null
        ip,        // string | null
      },
    });

    // Setear cookie httpOnly
    setRefreshCookie(res, rt, days);

    const { passwordHash, ...safeUser } = user;
    return res.json({ token: at, user: { ...safeUser }, remember: rememberFlag });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

//Carga masiva de empresa
export const createManyempresa = async (req: Request, res: Response) => {
  const { empresa } = req.body;

  if (!Array.isArray(empresa) || empresa.length === 0) {
    return res.status(400).json({ error: "Debes enviar un arreglo de empresa" });
  }

  try {
    const result = await prisma.empresa.createMany({
      data: empresa.map((e: { nombre: string }) => ({ nombre: e.nombre })),
      skipDuplicates: true, // evita error si alguna ya existe
    });

    return res.status(201).json({
      message: `Se agregaron ${result.count} comuna(s)`,
    });
  } catch (error: any) {
    console.error("Error al insertar empresa:", error);
    return res.status(500).json({ error: "Error al insertar empresa" });
  }
};


//POST Auth/inicio_visita
export const crearVisita = async (req: Request, res: Response) => {
  try {
    const { empresaId, tecnicoId, solicitante, realizado } = req.body;

    // Validaciones básicas
    if (!empresaId || !tecnicoId) {
      return res.status(400).json({ error: "empresaId y tecnicoId son obligatorios" });
    }

    // Crear la visita
    const nuevaVisita = await prisma.visita.create({
      data: {
        empresaId,
        tecnicoId,
        solicitante: solicitante?.trim() ?? '',
        realizado: realizado?.trim() ?? '',
        inicio: new Date(),     // se setea al iniciar
        fin: new Date(),        // puedes dejarlo como null si lo haces en 2 pasos y el modelo lo permite
        status: EstadoVisita.PENDIENTE,
      },
      select: {
        id: true,
        empresaId: true,
        tecnicoId: true,
        inicio: true,
        fin: true,
        status: true
      }
    });

    return res.status(201).json({ visita: nuevaVisita });

  } catch (error) {
    console.error("Error al crear visita:", error);
    return res.status(500).json({ error: "Error interno al crear la visita" });
  }
};

//PUT Auth/completar_visita
export const completarVisita = async (req: Request, res: Response) => {
  try {
    const visitaId = Number(req.params.id);
    const {
      confImpresoras,
      confTelefonos,
      confPiePagina,
      otros,
      otrosDetalle
    } = req.body;

    if (isNaN(visitaId)) {
      return res.status(400).json({ error: "ID de visita inválido" });
    }

    // Verifica si la visita existe
    const visitaExistente = await prisma.visita.findUnique({ where: { id: visitaId } });
    if (!visitaExistente) {
      return res.status(404).json({ error: "Visita no encontrada" });
    }

    // Actualiza los campos del formulario + marca la hora de finalización
    const visitaActualizada = await prisma.visita.update({
      where: { id: visitaId },
      data: {
        confImpresoras: Boolean(confImpresoras),
        confTelefonos: Boolean(confTelefonos),
        confPiePagina: Boolean(confPiePagina),
        otros: Boolean(otros),
        otrosDetalle: otrosDetalle?.trim() || null,
        fin: new Date(),
        status: EstadoVisita.COMPLETADA
      },
      select: {
        id: true,
        inicio: true,
        fin: true,
        status: true,
        confImpresoras: true,
        confTelefonos: true,
        confPiePagina: true,
        otros: true,
        otrosDetalle: true
      }
    });

    return res.status(200).json({ visita: visitaActualizada });

  } catch (error) {
    console.error("Error al actualizar visita:", error);
    return res.status(500).json({ error: "Error interno al completar la visita" });
  }
};

