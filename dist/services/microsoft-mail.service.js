"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDeliveryPdfEmail = sendDeliveryPdfEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const MAIL_TIMEOUT_MS = 15000;
const LOGO_CONTENT_ID = "brand-logo";
const logoCache = new Map();
function getOptionalEnv(...keys) {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value)
            return value;
    }
    return undefined;
}
function getGraphConfig() {
    const tenantId = getOptionalEnv("MICROSOFT_TENANT_ID", "MS_TENANT_ID");
    const clientId = getOptionalEnv("MICROSOFT_CLIENT_ID", "MS_CLIENT_ID", "CLIENT_ID");
    const clientSecret = getOptionalEnv("MICROSOFT_CLIENT_SECRET", "MS_CLIENT_SECRET", "CLIENT_SECRET");
    const sender = getOptionalEnv("MICROSOFT_MAIL_SENDER", "MICROSOFT_FROM_EMAIL", "EMAIL_USER");
    if (!tenantId || !clientId || !clientSecret || !sender) {
        throw new Error("Configura MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y MICROSOFT_MAIL_SENDER");
    }
    return { clientId, clientSecret, sender, tenantId };
}
function hasGraphConfig() {
    return Boolean(getOptionalEnv("MICROSOFT_TENANT_ID", "MS_TENANT_ID") &&
        getOptionalEnv("MICROSOFT_CLIENT_ID", "MS_CLIENT_ID", "CLIENT_ID") &&
        getOptionalEnv("MICROSOFT_CLIENT_SECRET", "MS_CLIENT_SECRET", "CLIENT_SECRET") &&
        getOptionalEnv("MICROSOFT_MAIL_SENDER", "MICROSOFT_FROM_EMAIL", "EMAIL_USER"));
}
function getSmtpConfig() {
    const host = getOptionalEnv("SMTP_HOST");
    const portRaw = getOptionalEnv("SMTP_PORT");
    const user = getOptionalEnv("SMTP_USER", "EMAIL_USER", "MAIL_USER");
    const pass = getOptionalEnv("SMTP_PASSWORD", "SMTP_PASS", "EMAIL_PASSWORD", "MAIL_PASS");
    if (!host || !user || !pass)
        return null;
    const port = Number(portRaw || 587);
    return {
        host,
        pass,
        port,
        secure: port === 465,
        user,
    };
}
async function fetchWithTimeout(url, init = {}, timeoutMs = MAIL_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timeout);
    }
}
async function getGraphAccessToken() {
    const { clientId, clientSecret, tenantId } = getGraphConfig();
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: GRAPH_SCOPE,
    });
    const response = await fetchWithTimeout(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    const data = (await response.json());
    if (!response.ok || !data.access_token) {
        throw new Error(data.error_description || "No se pudo obtener token de Microsoft Graph");
    }
    return data.access_token;
}
async function downloadPdfAsBase64(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("No se pudo descargar el PDF desde Cloudinary");
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
}
async function resolvePdfBase64(input) {
    if (input.pdfBuffer)
        return input.pdfBuffer.toString("base64");
    if (input.pdfBase64)
        return input.pdfBase64;
    if (!input.pdfUrl) {
        throw new Error("No se recibio el PDF para adjuntar al correo");
    }
    return downloadPdfAsBase64(input.pdfUrl);
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function getBrandConfig(brand) {
    if (brand === "econnet") {
        return {
            accentColor: "#111827",
            alt: "Econnet",
            labelColor: "#6B7280",
            logoFile: "logo-econnet.png",
            name: "Econnet",
        };
    }
    return {
        accentColor: "#155fa0",
        alt: "RIDS",
        labelColor: "#155fa0",
        logoFile: "logo-rids.png",
        name: "RIDS",
    };
}
function getLogoBase64(brand) {
    const brandConfig = getBrandConfig(brand);
    const cached = logoCache.get(brandConfig.logoFile);
    if (cached !== undefined)
        return cached;
    const logoPath = node_path_1.default.resolve(process.cwd(), "assets/images", brandConfig.logoFile);
    if (!node_fs_1.default.existsSync(logoPath)) {
        logoCache.set(brandConfig.logoFile, "");
        return "";
    }
    const logoBase64 = node_fs_1.default.readFileSync(logoPath).toString("base64");
    logoCache.set(brandConfig.logoFile, logoBase64);
    return logoBase64;
}
function buildDeliveryEmailHtml({ brand, companyName, recipientName, }) {
    const brandConfig = getBrandConfig(brand);
    const safeCompanyName = escapeHtml(companyName);
    const safeRecipientName = escapeHtml(recipientName || "");
    const logoBase64 = getLogoBase64(brand);
    const logoMarkup = logoBase64
        ? `<img src="cid:${LOGO_CONTENT_ID}" width="132" alt="${brandConfig.alt}" style="display:block;border:0;outline:none;text-decoration:none;max-width:132px;height:auto;" />`
        : `<strong style="font-size:24px;letter-spacing:.04em;color:${brandConfig.accentColor};">${brandConfig.name}</strong>`;
    return `
    <!doctype html>
    <html lang="es">
      <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#101828;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5eaf2;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="background:${brandConfig.accentColor};padding:24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>${logoMarkup}</td>
                        <td align="right" style="font-size:12px;font-weight:700;color:#d9ecff;text-transform:uppercase;letter-spacing:.08em;">Comprobante de entrega</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 28px 10px;">
                    <h1 style="margin:0;color:#101828;font-size:24px;line-height:1.25;font-weight:800;">Entrega registrada correctamente</h1>
                    <p style="margin:14px 0 0;color:#475467;font-size:15px;line-height:1.7;">Hola ${safeRecipientName || "equipo"}, adjuntamos el comprobante PDF de la entrega realizada para <strong style="color:#101828;">${safeCompanyName}</strong>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fbff;border:1px solid #dbeafe;border-radius:14px;">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 6px;color:${brandConfig.labelColor};font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">Empresa</p>
                          <p style="margin:0;color:#101828;font-size:18px;font-weight:800;">${safeCompanyName}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;">
                    <p style="margin:0;color:#475467;font-size:14px;line-height:1.7;">El documento adjunto contiene el detalle de la evidencia, firma de recepción y fecha del registro.</p>
                    <p style="margin:22px 0 0;color:#101828;font-size:14px;line-height:1.7;"><strong>Saludos Cordiales,</strong><br/>${brandConfig.name}</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;border-top:1px solid #e5eaf2;padding:16px 28px;">
                    <p style="margin:0;color:#667085;font-size:12px;line-height:1.6;">Este correo fue generado automáticamente por ${brandConfig.name}.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
async function sendDeliveryPdfViaSmtp(input) {
    const smtp = getSmtpConfig();
    if (!smtp)
        return false;
    const pdfBase64 = await resolvePdfBase64(input);
    const transporter = nodemailer_1.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        connectionTimeout: MAIL_TIMEOUT_MS,
        greetingTimeout: MAIL_TIMEOUT_MS,
        socketTimeout: MAIL_TIMEOUT_MS,
        auth: {
            user: smtp.user,
            pass: smtp.pass,
        },
    });
    await transporter.sendMail({
        from: `"Soporte RIDS" <${smtp.user}>`,
        to: input.recipientEmail,
        cc: input.ccEmail,
        subject: `Comprobante de entrega - ${input.companyName}`,
        html: buildDeliveryEmailHtml(input),
        attachments: [
            ...(getLogoBase64(input.brand)
                ? [
                    {
                        cid: LOGO_CONTENT_ID,
                        content: Buffer.from(getLogoBase64(input.brand), "base64"),
                        contentType: "image/png",
                        filename: getBrandConfig(input.brand).logoFile,
                    },
                ]
                : []),
            {
                filename: input.pdfFileName,
                content: Buffer.from(pdfBase64, "base64"),
                contentType: "application/pdf",
            },
        ],
    });
    return true;
}
async function sendDeliveryPdfViaGraph({ brand, ccEmail, companyName, pdfBase64: providedPdfBase64, pdfBuffer, pdfFileName, pdfUrl, recipientEmail, recipientName, senderName, }) {
    const { sender } = getGraphConfig();
    const [accessToken, pdfBase64] = await Promise.all([
        getGraphAccessToken(),
        resolvePdfBase64({ pdfBase64: providedPdfBase64, pdfBuffer, pdfUrl }),
    ]);
    const subject = `Comprobante de entrega - ${companyName}`;
    const body = {
        message: {
            subject,
            body: {
                contentType: "HTML",
                content: buildDeliveryEmailHtml({ brand, companyName, recipientName }),
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: recipientEmail,
                        name: recipientName || recipientEmail,
                    },
                },
            ],
            ccRecipients: [
                {
                    emailAddress: {
                        address: ccEmail,
                        name: senderName || ccEmail,
                    },
                },
            ],
            attachments: [
                ...(getLogoBase64(brand)
                    ? [
                        {
                            "@odata.type": "#microsoft.graph.fileAttachment",
                            contentBytes: getLogoBase64(brand),
                            contentId: LOGO_CONTENT_ID,
                            contentType: "image/png",
                            isInline: true,
                            name: getBrandConfig(brand).logoFile,
                        },
                    ]
                    : []),
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: pdfFileName,
                    contentType: "application/pdf",
                    contentBytes: pdfBase64,
                },
            ],
        },
        saveToSentItems: true,
    };
    const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Microsoft Graph no pudo enviar el correo");
    }
}
async function sendDeliveryPdfEmail({ brand, ccEmail, companyName, pdfBase64, pdfBuffer, pdfFileName, pdfUrl, recipientEmail, recipientName, senderName, }) {
    const input = {
        ccEmail,
        brand,
        companyName,
        pdfBase64,
        pdfBuffer,
        pdfFileName,
        pdfUrl,
        recipientEmail,
        recipientName,
        senderName,
    };
    let graphError;
    if (hasGraphConfig()) {
        try {
            await sendDeliveryPdfViaGraph(input);
            return;
        }
        catch (error) {
            graphError = error;
        }
    }
    try {
        const sentBySmtp = await sendDeliveryPdfViaSmtp(input);
        if (sentBySmtp)
            return;
    }
    catch (smtpError) {
        if (!graphError)
            throw smtpError;
        const graphMessage = graphError instanceof Error ? graphError.message : "Graph no pudo enviar el correo";
        const smtpMessage = smtpError instanceof Error ? smtpError.message : "SMTP no pudo enviar el correo";
        throw new Error(`No se pudo enviar el correo. SMTP: ${smtpMessage}. Graph: ${graphMessage}`);
    }
    if (graphError)
        throw graphError;
    throw new Error("Configura SMTP o Microsoft Graph para enviar correos");
}
