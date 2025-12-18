import crypto from "crypto";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const baseFolder = (process.env.CLOUDINARY_FOLDER || "entregas").replace(/\/+$/, "");

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error("Faltan variables de Cloudinary (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)");
}

const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

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

export function createUploadSignature({ folder, publicId, timestamp }: UploadSignatureInput) {
  if (!folder || !publicId) {
    throw new Error("folder y publicId son requeridos para firmar la subida a Cloudinary");
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
