import {
  isSlackProviderUsable,
} from "@/lib/external-notifications/config";
import type {
  SendSlackMessageParams,
  SendSlackMessageResult,
  SlackProvider,
} from "@/lib/external-notifications/slack-provider";
import { WebhookSlackProvider } from "@/lib/external-notifications/slack-provider";

export function getSlackProvider(): SlackProvider | null {
  return isSlackProviderUsable() ? new WebhookSlackProvider() : null;
}

export async function sendSlackMessage(
  params: SendSlackMessageParams,
): Promise<SendSlackMessageResult> {
  const provider = getSlackProvider();

  if (!provider) {
    return { ok: false, error: "slack notifications are disabled" };
  }

  return provider.sendMessage(params);
}
