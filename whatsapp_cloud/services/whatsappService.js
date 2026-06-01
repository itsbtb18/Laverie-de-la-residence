const QRCode = require('qrcode');

const { formatPhoneForMeta } = require('./phone');
const { getGreetingByAlgeriaTime } = require('./greeting');

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';

function getMetaConfig() {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const businessAccountId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID sont requis (API Cloud Meta).'
    );
  }

  return { accessToken, phoneNumberId, businessAccountId };
}

function graphUrl(phoneNumberId, path = 'messages') {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/${path}`;
}

function templateConfig() {
  return {
    welcome: (process.env.WHATSAPP_TEMPLATE_WELCOME || 'creation_compte_client').trim(),
    confirmation: (
      process.env.WHATSAPP_TEMPLATE_CONFIRMATION || 'confirmation_rendez_vous'
    ).trim(),
    reminder: (process.env.WHATSAPP_TEMPLATE_REMINDER || 'rappel_rendez_vous').trim(),
    language: (process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'fr').trim(),
  };
}

function textParameters(values) {
  return values.map((value) => ({
    type: 'text',
    text: value == null ? '' : String(value),
  }));
}

async function metaRequest(url, options) {
  const { accessToken } = getMetaConfig();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      payload.error?.message ||
      payload.error?.error_user_msg ||
      JSON.stringify(payload).slice(0, 500);
    throw new Error(`Meta API ${response.status}: ${detail}`);
  }

  return payload;
}

/**
 * Envoie un message template WhatsApp Cloud.
 */
async function sendTemplateMessage(to, templateName, bodyParameters, languageCode) {
  const { phoneNumberId } = getMetaConfig();
  const recipient = formatPhoneForMeta(to);

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: textParameters(bodyParameters),
        },
      ],
    },
  };

  return metaRequest(graphUrl(phoneNumberId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function sendImageByLink(to, imageUrl, caption = '') {
  const { phoneNumberId } = getMetaConfig();
  const recipient = formatPhoneForMeta(to);

  const image = { link: imageUrl };
  if (caption) {
    image.caption = caption;
  }

  return metaRequest(graphUrl(phoneNumberId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'image',
      image,
    }),
  });
}

async function sendImageByMediaId(to, mediaId, caption = '') {
  const { phoneNumberId } = getMetaConfig();
  const recipient = formatPhoneForMeta(to);

  const image = { id: String(mediaId) };
  if (caption) {
    image.caption = caption;
  }

  return metaRequest(graphUrl(phoneNumberId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'image',
      image,
    }),
  });
}

async function uploadImageBuffer(imageBuffer, mimeType = 'image/png') {
  const { phoneNumberId } = getMetaConfig();
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: mimeType });
  formData.append('file', blob, 'qrcode.png');
  formData.append('type', mimeType);
  formData.append('messaging_product', 'whatsapp');

  const payload = await metaRequest(graphUrl(phoneNumberId, 'media'), {
    method: 'POST',
    body: formData,
  });

  if (!payload.id) {
    throw new Error('Meta Media API : identifiant média manquant dans la réponse.');
  }

  return payload.id;
}

async function sendQrCodePayload(to, qrCodeUrlOrId, caption) {
  const value = String(qrCodeUrlOrId || '').trim();

  if (!value) {
    throw new Error('qrCodeUrlOrId est requis pour le message QR.');
  }

  if (/^https?:\/\//i.test(value)) {
    await sendImageByLink(to, value, caption);
    return;
  }

  if (/^\d+$/.test(value)) {
    await sendImageByMediaId(to, value, caption);
    return;
  }

  const pngBuffer = await QRCode.toBuffer(value, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 8,
  });
  const mediaId = await uploadImageBuffer(pngBuffer);
  await sendImageByMediaId(to, mediaId, caption);
}

function formatFrenchDate(dateValue) {
  if (!dateValue) {
    return '';
  }

  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Algiers',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

/**
 * Template d'inscription + image QR (URL publique, ID média Meta, ou payload LOGIN:…).
 *
 * Variables body du template (ordre à faire correspondre dans Meta Business) :
 * 1. Salutation (Bonjour/Bonsoir)
 * 2. Prénom
 * 3. Nom
 * 4. Téléphone
 * 5. Code secret
 * 6. Lien du site
 */
async function sendWelcomeTemplate(
  to,
  nom,
  prenom,
  telephone,
  codeSecret,
  lienSite,
  qrCodeUrlOrId
) {
  const templates = templateConfig();
  const greeting = getGreetingByAlgeriaTime();

  await sendTemplateMessage(
    to,
    templates.welcome,
    [greeting, prenom || '', nom || '', telephone, codeSecret, lienSite],
    templates.language
  );

  await sendQrCodePayload(
    to,
    qrCodeUrlOrId || `LOGIN:${telephone}:${codeSecret}`,
    'QR — présentez ce code à l’assistant'
  );
}

/**
 * Template de confirmation de rendez-vous.
 *
 * Variables body :
 * 1. Salutation
 * 2. Prénom
 * 3. Nom
 * 4. Mode de lavage
 * 5. Date (formatée)
 * 6. Heure
 */
async function sendConfirmationTemplate(to, nom, prenom, modeLavage, date, heure) {
  const templates = templateConfig();
  const greeting = getGreetingByAlgeriaTime();
  const prettyDate = formatFrenchDate(date);

  await sendTemplateMessage(
    to,
    templates.confirmation,
    [greeting, prenom || '', nom || '', modeLavage, prettyDate, heure],
    templates.language
  );
}

/**
 * Template de rappel (30 min avant le rendez-vous).
 *
 * Variables body :
 * 1. Salutation
 * 2. Prénom
 * 3. Nom
 */
async function sendReminderTemplate(to, nom, prenom) {
  const templates = templateConfig();
  const greeting = getGreetingByAlgeriaTime();

  await sendTemplateMessage(
    to,
    templates.reminder,
    [greeting, prenom || '', nom || ''],
    templates.language
  );
}

module.exports = {
  sendWelcomeTemplate,
  sendConfirmationTemplate,
  sendReminderTemplate,
  sendTemplateMessage,
  sendImageByLink,
  sendImageByMediaId,
  uploadImageBuffer,
  formatPhoneForMeta,
  getGreetingByAlgeriaTime,
};
