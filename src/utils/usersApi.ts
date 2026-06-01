import { normalizePhoneInput } from "./validation";

export type ListedCustomer = {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  role: string;
};

/** Normalize search text; full Algerian phones are sent as 10 digits. */
export function normalizeClientSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "";
  }

  const digits = normalizePhoneInput(trimmed);
  if (/^0[2567]\d{8}$/.test(digits)) {
    return digits;
  }

  return trimmed;
}

export function parseUserListPayload(data: unknown): ListedCustomer[] {
  if (Array.isArray(data)) {
    return data as ListedCustomer[];
  }

  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: ListedCustomer[] }).results;
  }

  return [];
}
