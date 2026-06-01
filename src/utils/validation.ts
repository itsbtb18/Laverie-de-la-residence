/** Algerian mobile/landline: 10 digits starting with 02, 05, 06 or 07. */
const PHONE_REGEX = /^0[2567]\d{8}$/;

export function normalizePhoneInput(value: string): string {
  return value.replace(/[\s\-().]/g, "").trim();
}

export function isValidAlgerianPhone(value: string): boolean {
  return PHONE_REGEX.test(normalizePhoneInput(value));
}

export function isValidSecretCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}
