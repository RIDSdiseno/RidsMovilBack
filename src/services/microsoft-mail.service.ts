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

function getGraphConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const sender = process.env.MICROSOFT_MAIL_SENDER || process.env.MICROSOFT_FROM_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !sender) {
    throw new Error(
      "Configura MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y MICROSOFT_MAIL_SENDER"
    );
  }

  return { clientId, clientSecret, sender, tenantId };
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

export async function sendDeliveryPdfEmail({
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
        content: `
          <p>Hola ${recipientName || ""},</p>
          <p>Adjuntamos el comprobante PDF de la entrega realizada para <strong>${companyName}</strong>.</p>
          <p>Saludos,<br/>${senderName || "Equipo RIDS"}</p>
        `,
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
