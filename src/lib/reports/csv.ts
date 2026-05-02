export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

const CSV_INJECTION_PREFIX = /^[=+\-@]/;

export function sanitizeCsvValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (CSV_INJECTION_PREFIX.test(text)) {
    return `'${text}`;
  }

  return text;
}

export function escapeCsvValue(value: CsvValue) {
  const sanitized = sanitizeCsvValue(value);
  const escaped = sanitized.replace(/"/g, '""');

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function generateCsvReport({
  headers,
  rows,
}: {
  headers: string[];
  rows: CsvRow[];
}) {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function formatCsvDate(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

export function formatCsvDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

export function maskReportPhoneNumber(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length < 7) {
    return "***";
  }

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function truncateReportText(value: string | null | undefined, max = 80) {
  if (!value) {
    return "";
  }

  return value.length > max ? `${value.slice(0, max)}...` : value;
}
