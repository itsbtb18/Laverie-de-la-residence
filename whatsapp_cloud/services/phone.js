/**
 * Formate un numéro algérien pour l'API WhatsApp Cloud Meta.
 * Retourne uniquement des chiffres, sans « + » (ex. 2135XXXXXXXX).
 */
function formatPhoneForMeta(phone) {
  if (!phone) {
    throw new Error('Numéro de téléphone manquant.');
  }

  const digits = String(phone).replace(/\D/g, '');

  if (digits.startsWith('213') && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `213${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `213${digits}`;
  }

  throw new Error(`Numéro algérien invalide : ${phone}`);
}

module.exports = { formatPhoneForMeta };
