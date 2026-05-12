import { getClickUpSyncConfig, type ClickUpSyncConfig } from "@/lib/clickup/config";

const CLICKUP_API_BASE_URL = "https://api.clickup.com/api/v2";

export class ClickUpApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ClickUpApiError";
    this.status = status;
  }
}

export async function clickUpGet<TResponse>(
  path: string,
  config: ClickUpSyncConfig = getClickUpSyncConfig(),
): Promise<TResponse> {
  if (!config.apiToken) {
    throw new ClickUpApiError("ClickUp API token is not configured.");
  }

  const response = await fetch(`${CLICKUP_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: config.apiToken,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ClickUpApiError(
      `ClickUp API request failed with status ${response.status}.`,
      response.status,
    );
  }

  return response.json() as Promise<TResponse>;
}
