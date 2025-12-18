"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryConfig = void 0;
exports.buildVisitFolder = buildVisitFolder;
exports.buildEntregaFolder = buildEntregaFolder;
exports.createUploadSignature = createUploadSignature;
const crypto_1 = __importDefault(require("crypto"));
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const baseFolder = (process.env.CLOUDINARY_FOLDER || "entregas").replace(/\/+$/, "");
if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Faltan variables de Cloudinary (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)");
}
const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
exports.cloudinaryConfig = {
    cloudName,
    apiKey,
    apiSecret,
    baseFolder,
    uploadUrl,
};
function buildVisitFolder(visitaId) {
    return `${baseFolder}/visita-${visitaId}`;
}
function buildEntregaFolder(entregaId) {
    return `${baseFolder}/entrega-${entregaId}`;
}
function createUploadSignature({ folder, publicId, timestamp }) {
    if (!folder || !publicId) {
        throw new Error("folder y publicId son requeridos para firmar la subida a Cloudinary");
    }
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${ts}${apiSecret}`;
    const signature = crypto_1.default.createHash("sha1").update(toSign).digest("hex");
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
