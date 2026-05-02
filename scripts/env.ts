import { existsSync, readFileSync } from "node:fs";

export function loadLocalEnv() {
  if (process.env.DATABASE_URL || !existsSync(".env")) {
    return;
  }

  const lines = readFileSync(".env", "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const rawValue = valueParts.join("=");
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
