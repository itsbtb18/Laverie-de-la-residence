const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

const {
  sendWelcomeTemplate,
  sendConfirmationTemplate,
  sendReminderTemplate,
} = require('./services/whatsappService');
const { formatPhoneForMeta } = require('./services/phone');
const { startReminderScheduler } = require('./services/scheduler');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const config = {
  port: Number(process.env.WHATSAPP_SERVICE_PORT || process.env.PORT || 5000),
  djangoApiKey: (process.env.DJANGO_API_KEY || '').trim(),
  djangoApiUrl: (process.env.DJANGO_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, ''),
  customerSiteUrl: (process.env.CUSTOMER_SITE_URL || 'https://127.0.0.1:5173/login').trim(),
};

const app = express();
app.use(express.json({ limit: '1mb' }));

function authGuard(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!config.djangoApiKey || token !== config.djangoApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

function normalizeBody(body = {}) {
  return {
    phone: body.phone,
    firstName: body.firstName || body.first_name,
    lastName: body.lastName || body.last_name,
    nom: body.nom || body.last_name || body.lastName,
    prenom: body.prenom || body.first_name || body.firstName,
    telephone: body.telephone || body.phone,
    codeSecret: body.codeSecret || body.secret_code || body.secretCode,
    lienSite: body.lienSite || body.site_url || body.siteUrl,
    qrCodeUrlOrId:
      body.qrCodeUrlOrId || body.qr_code_url_or_id || body.qrPayload || body.qr_payload,
    modeLavage: body.modeLavage || body.wash_mode_label || body.washModeLabel,
    date: body.date || body.booking_date || body.bookingDate,
    heure: body.heure || body.start_time || body.startTime || body.time,
    establishmentName: body.establishmentName || body.establishment_name,
    bookingReference: body.bookingReference || body.booking_reference,
  };
}

app.get('/health', (req, res) => {
  const hasMeta =
    Boolean(process.env.WHATSAPP_ACCESS_TOKEN) &&
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);

  res.json({
    status: 'ok',
    provider: 'meta-cloud-api',
    metaConfigured: hasMeta,
    djangoApiUrl: config.djangoApiUrl,
  });
});

app.post('/api/v1/whatsapp/welcome', authGuard, async (req, res) => {
  try {
    const body = normalizeBody(req.body);
    const { phone, prenom, nom, telephone, codeSecret, lienSite, qrCodeUrlOrId } = body;

    if (!phone || !codeSecret) {
      return res.status(400).json({ error: 'phone et codeSecret sont requis.' });
    }

    formatPhoneForMeta(phone);

    await sendWelcomeTemplate(
      phone,
      nom || '',
      prenom || '',
      telephone || phone,
      codeSecret,
      lienSite || config.customerSiteUrl,
      qrCodeUrlOrId || `LOGIN:${phone}:${codeSecret}`
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('[welcome]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/v1/whatsapp/confirmation', authGuard, async (req, res) => {
  try {
    const body = normalizeBody(req.body);
    const { phone, prenom, nom, modeLavage, date, heure } = body;

    if (!phone || !modeLavage || !date || !heure) {
      return res.status(400).json({
        error: 'phone, modeLavage, date et heure sont requis.',
      });
    }

    formatPhoneForMeta(phone);

    await sendConfirmationTemplate(phone, nom || '', prenom || '', modeLavage, date, heure);

    return res.json({ success: true });
  } catch (error) {
    console.error('[confirmation]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/v1/whatsapp/reminder', authGuard, async (req, res) => {
  try {
    const body = normalizeBody(req.body);
    const { phone, prenom, nom } = body;

    if (!phone) {
      return res.status(400).json({ error: 'phone est requis.' });
    }

    formatPhoneForMeta(phone);
    await sendReminderTemplate(phone, nom || '', prenom || '');

    return res.json({ success: true });
  } catch (error) {
    console.error('[reminder]', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.listen(config.port, () => {
  console.log(`WhatsApp Cloud API — port ${config.port}`);
  console.log(`Django API: ${config.djangoApiUrl}`);

  if (!config.djangoApiKey) {
    console.warn('ATTENTION: DJANGO_API_KEY est vide.');
  }

  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('ATTENTION: variables Meta WhatsApp manquantes.');
  }

  startReminderScheduler({ config });
});
