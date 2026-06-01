import type { TFunction } from "i18next";

import { isValidAlgerianPhone, isValidSecretCode, normalizePhoneInput } from "./validation";

export type ApiErrorContext =
  | "customerLogin"
  | "staffLogin"
  | "adminCreateCustomer"
  | "adminUpdateCustomer"
  | "adminGeneral"
  | "superAdmin";

export type ApiErrorPayload = {
  code?: string;
  detail?: string;
  message?: string;
  phone?: string | string[];
  secret_code?: string | string[];
  first_name?: string | string[];
  last_name?: string | string[];
  establishment?: string | string[];
  non_field_errors?: string | string[];
  existing_user_id?: number;
  [key: string]: unknown;
};

const ERROR_CODE_KEYS: Record<string, string> = {
  AUTH_MISSING_FIELDS: "errors.authMissingFields",
  AUTH_INVALID_CREDENTIALS: "errors.authInvalidCredentials",
  AUTH_ACCOUNT_INACTIVE: "errors.authAccountInactive",
  STAFF_ACCESS_DENIED: "errors.staffAccessDenied",
  CUSTOMER_USE_CLIENT_PORTAL: "errors.customerUseClientPortal",
  PHONE_ALREADY_EXISTS: "errors.phoneAlreadyExists",
  PHONE_INVALID_FORMAT: "errors.phoneInvalidFormat",
  SECRET_CODE_INVALID_FORMAT: "errors.secretCodeInvalidFormat",
  FIELD_REQUIRED: "errors.fieldRequired",
  VALIDATION_ERROR: "errors.validationError",
  NOT_FOUND: "errors.notFound",
  PERMISSION_DENIED: "errors.permissionDenied",
  SERVER_ERROR: "errors.serverError",
  NETWORK_ERROR: "errors.networkError",
  CLIENT_FORM_REQUIRED: "errors.clientFormRequired",
  CLIENT_PHONE_INVALID: "errors.phoneInvalidFormat",
  CLIENT_SECRET_INVALID: "errors.secretCodeInvalidFormat",
};

function firstFieldMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

export async function readApiErrorPayload(response: Response): Promise<ApiErrorPayload | null> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return null;
  }
}

export function mapCodeToMessage(
  code: string | undefined,
  context: ApiErrorContext,
  t: TFunction
): string | null {
  if (!code) {
    return null;
  }

  if (
    context === "customerLogin" &&
    (code === "STAFF_ACCESS_DENIED" || code === "CUSTOMER_USE_CLIENT_PORTAL")
  ) {
    return t("errors.authInvalidCredentials");
  }

  const key = ERROR_CODE_KEYS[code];
  if (key) {
    return t(key);
  }

  return null;
}

export function resolveApiErrorMessage(
  payload: ApiErrorPayload | null,
  context: ApiErrorContext,
  t: TFunction,
  options?: { status?: number; networkError?: boolean }
): string {
  if (options?.networkError) {
    return t("errors.networkError");
  }

  if (!payload) {
    if (options?.status && options.status >= 500) {
      return t("errors.serverError");
    }
    return t("errors.generic");
  }

  const codeMessage = mapCodeToMessage(
    typeof payload.code === "string" ? payload.code : undefined,
    context,
    t
  );
  if (codeMessage) {
    if (
      payload.code === "PHONE_ALREADY_EXISTS" &&
      context === "adminCreateCustomer" &&
      payload.existing_user_id
    ) {
      return t("errors.phoneAlreadyExistsWithId", { id: payload.existing_user_id });
    }
    return codeMessage;
  }

  const fieldPhone = firstFieldMessage(payload.phone);
  if (fieldPhone) {
    if (context === "adminCreateCustomer" && fieldPhone.toLowerCase().includes("existe")) {
      return t("errors.phoneAlreadyExists");
    }
    return fieldPhone;
  }

  const fieldSecret = firstFieldMessage(payload.secret_code);
  if (fieldSecret) {
    return fieldSecret;
  }

  const nonField = firstFieldMessage(payload.non_field_errors);
  if (nonField) {
    return nonField;
  }

  if (typeof payload.detail === "string" && payload.detail.trim()) {
    if (
      context === "customerLogin" &&
      (payload.detail.includes("réservée aux clients") ||
        payload.detail.includes("personnel autorisé"))
    ) {
      return t("errors.authInvalidCredentials");
    }
    return payload.detail.trim();
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (options?.status === 401 || options?.status === 403) {
    if (context === "customerLogin") {
      return t("errors.authInvalidCredentials");
    }
    if (context === "staffLogin") {
      return options.status === 403
        ? t("errors.staffAccessDenied")
        : t("errors.authInvalidCredentials");
    }
  }

  if (options?.status && options.status >= 500) {
    return t("errors.serverError");
  }

  return t("errors.generic");
}

export function validateLoginForm(
  phone: string,
  secretCode: string,
  t: TFunction
): string | null {
  const normalizedPhone = normalizePhoneInput(phone);
  const normalizedSecret = secretCode.trim();

  if (!normalizedPhone || !normalizedSecret) {
    return t("errors.authMissingFields");
  }
  if (!isValidAlgerianPhone(normalizedPhone)) {
    return t("errors.phoneInvalidFormat");
  }
  if (!isValidSecretCode(normalizedSecret)) {
    return t("errors.secretCodeInvalidFormat");
  }
  return null;
}

export function validateAdminCustomerForm(
  fields: {
    firstName: string;
    lastName: string;
    phone: string;
    secretCode: string;
  },
  t: TFunction
): string | null {
  if (
    !fields.firstName.trim() ||
    !fields.lastName.trim() ||
    !fields.phone.trim() ||
    !fields.secretCode.trim()
  ) {
    return t("errors.clientFormRequired");
  }
  if (!isValidAlgerianPhone(fields.phone)) {
    return t("errors.phoneInvalidFormat");
  }
  if (!isValidSecretCode(fields.secretCode)) {
    return t("errors.secretCodeInvalidFormat");
  }
  return null;
}
