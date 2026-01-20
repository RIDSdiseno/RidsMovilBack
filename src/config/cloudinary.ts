import crypto from "crypto";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const baseFolder = (process.env.CLOUDINARY_FOLDER || "entregas").replace(/\/+$/, "");

// 👉 Flag de estado
export const cloudinaryEnabled = Boolean(
  cloudName && apiKey && apiSecret
);

if (!cloudinaryEnabled) {
  console.warn("⚠️ Cloudinary NO configurado. Subidas de imágenes deshabilitadas.");
}

const uploadUrl = cloudName
  ? `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`
  : null;

export const cloudinaryConfig = {
  cloudName,
  apiKey,
  apiSecret,
  baseFolder,
  uploadUrl,
};

export type UploadSignatureInput = {
  folder: string;
  publicId: string;
  timestamp?: number;
};

export function buildVisitFolder(visitaId: number) {
  return `${baseFolder}/visita-${visitaId}`;
}

export function buildEntregaFolder(entregaId: number) {
  return `${baseFolder}/entrega-${entregaId}`;
}

export function createUploadSignature({
  folder,
  publicId,
  timestamp,
}: UploadSignatureInput) {

  // 🚨 ERROR SOLO CUANDO REALMENTE SE USA CLOUDINARY
  if (!cloudinaryEnabled) {
    throw new Error("Cloudinary no está configurado en este entorno");
  }

  if (!folder || !publicId) {
    throw new Error("folder y publicId son requeridos para firmar la subida");
  }

  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${ts}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  return {
    uploadUrl,
    apiKey,
    timestamp: ts,
    folder,
    publicId,
    signature,
    cloudName,
  };
}
