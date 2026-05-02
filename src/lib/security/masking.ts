function emptyMask(value: string | null | undefined) {
  return value && value.trim().length > 0 ? null : "-";
}

export function maskResidentId(value: string | null | undefined) {
  const empty = emptyMask(value);
  if (empty) return empty;

  const digits = value!.replace(/\D/g, "");
  if (digits.length < 7) return "***";

  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
}

export function maskForeignResidentId(value: string | null | undefined) {
  return maskResidentId(value);
}

export function maskBankAccount(value: string | null | undefined) {
  const empty = emptyMask(value);
  if (empty) return empty;

  const normalized = value!.replace(/\s+/g, "");
  if (normalized.length <= 6) return "***";

  return `${normalized.slice(0, 3)}${"*".repeat(Math.max(normalized.length - 6, 3))}${normalized.slice(-3)}`;
}

export function maskPhoneNumber(value: string | null | undefined) {
  const empty = emptyMask(value);
  if (empty) return empty;

  const digits = value!.replace(/\D/g, "");
  if (digits.length < 7) return "***";

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-***-${digits.slice(-4)}`;
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function maskEmail(value: string | null | undefined) {
  const empty = emptyMask(value);
  if (empty) return empty;

  const [localPart, domain] = value!.split("@");
  if (!localPart || !domain) return "***";

  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function maskAddress(value: string | null | undefined) {
  const empty = emptyMask(value);
  if (empty) return empty;

  const parts = value!.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return "****";

  return `${parts.slice(0, Math.min(parts.length, 3)).join(" ")} ****`;
}

export function maskBirthDate(value: Date | string | null | undefined) {
  if (!value) return "-";

  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const year = text.match(/^\d{4}/)?.[0];

  return year ? `${year}-**-**` : "****-**-**";
}

export function maskSensitiveText(value: string | null | undefined) {
  const empty = emptyMask(value);
  if (empty) return empty;

  const trimmed = value!.trim();
  if (trimmed.length <= 1) return "*";

  return `${trimmed.slice(0, 1)}***`;
}
