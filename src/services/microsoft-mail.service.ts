import nodemailer from "nodemailer";

type GraphTokenResponse = {
  access_token?: string;
  error_description?: string;
};

type SendDeliveryPdfInput = {
  ccEmail: string;
  companyName: string;
  pdfFileName: string;
  pdfUrl: string;
  recipientEmail: string;
  recipientName: string;
  senderName: string;
};

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

function getOptionalEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function getGraphConfig() {
  const tenantId = getOptionalEnv("MICROSOFT_TENANT_ID", "MS_TENANT_ID");
  const clientId = getOptionalEnv("MICROSOFT_CLIENT_ID", "MS_CLIENT_ID", "CLIENT_ID");
  const clientSecret = getOptionalEnv("MICROSOFT_CLIENT_SECRET", "MS_CLIENT_SECRET", "CLIENT_SECRET");
  const sender = getOptionalEnv("MICROSOFT_MAIL_SENDER", "MICROSOFT_FROM_EMAIL", "EMAIL_USER");

  if (!tenantId || !clientId || !clientSecret || !sender) {
    throw new Error(
      "Configura MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y MICROSOFT_MAIL_SENDER"
    );
  }

  return { clientId, clientSecret, sender, tenantId };
}

function getSmtpConfig() {
  const host = getOptionalEnv("SMTP_HOST");
  const portRaw = getOptionalEnv("SMTP_PORT");
  const user = getOptionalEnv("SMTP_USER", "EMAIL_USER", "MAIL_USER");
  const pass = getOptionalEnv("SMTP_PASSWORD", "SMTP_PASS", "EMAIL_PASSWORD", "MAIL_PASS");

  if (!host || !user || !pass) return null;

  const port = Number(portRaw || 587);
  return {
    host,
    pass,
    port,
    secure: port === 465,
    user,
  };
}

async function getGraphAccessToken() {
  const { clientId, clientSecret, tenantId } = getGraphConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: GRAPH_SCOPE,
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await response.json()) as GraphTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "No se pudo obtener token de Microsoft Graph");
  }

  return data.access_token;
}

async function downloadPdfAsBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("No se pudo descargar el PDF desde Cloudinary");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDeliveryEmailHtml({
  companyName,
  recipientName,
  senderName,
}: Pick<SendDeliveryPdfInput, "companyName" | "recipientName" | "senderName">) {
  const safeCompanyName = escapeHtml(companyName);
  const safeRecipientName = escapeHtml(recipientName || "");
  const safeSenderName = escapeHtml(senderName || "Equipo RIDS");

  return `
    <p>Hola ${safeRecipientName},</p>
    <p>Adjuntamos el comprobante PDF de la entrega realizada para <strong>${safeCompanyName}</strong>.</p>
    <p>Saludos,<br/>${safeSenderName}</p>
  `;
}

async function sendDeliveryPdfViaSmtp(input: SendDeliveryPdfInput) {
  const smtp = getSmtpConfig();
  if (!smtp) return false;

  const pdfBase64 = await downloadPdfAsBase64(input.pdfUrl);
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
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
      {
        filename: input.pdfFileName,
        content: Buffer.from(pdfBase64, "base64"),
        contentType: "application/pdf",
      },
    ],
  });

  return true;
}

async function sendDeliveryPdfViaGraph({
  ccEmail,
  companyName,
  pdfFileName,
  pdfUrl,
  recipientEmail,
  recipientName,
  senderName,
}: SendDeliveryPdfInput) {
  const { sender } = getGraphConfig();
  const [accessToken, pdfBase64] = await Promise.all([
    getGraphAccessToken(),
    downloadPdfAsBase64(pdfUrl),
  ]);

  const subject = `Comprobante de entrega - ${companyName}`;
  const body = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: buildDeliveryEmailHtml({ companyName, recipientName, senderName }),
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

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
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

export async function sendDeliveryPdfEmail({
  ccEmail,
  companyName,
  pdfFileName,
  pdfUrl,
  recipientEmail,
  recipientName,
  senderName,
}: SendDeliveryPdfInput) {
  const input = {
    ccEmail,
    companyName,
    pdfFileName,
    pdfUrl,
    recipientEmail,
    recipientName,
    senderName,
  };

  let smtpError: unknown;
  try {
    const sentBySmtp = await sendDeliveryPdfViaSmtp(input);
    if (sentBySmtp) return;
  } catch (error) {
    smtpError = error;
  }

  try {
    await sendDeliveryPdfViaGraph(input);
  } catch (graphError) {
    if (!smtpError) throw graphError;

    const smtpMessage = smtpError instanceof Error ? smtpError.message : "SMTP no pudo enviar el correo";
    const graphMessage = graphError instanceof Error ? graphError.message : "Graph no pudo enviar el correo";
    throw new Error(`No se pudo enviar el correo. SMTP: ${smtpMessage}. Graph: ${graphMessage}`);
  }
}
