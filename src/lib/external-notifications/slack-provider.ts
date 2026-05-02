export type SendSlackMessageParams = {
  text: string;
  blocks?: unknown[];
};

export type SendSlackMessageResult = {
  ok: boolean;
  error?: string;
};

export interface SlackProvider {
  sendMessage(params: SendSlackMessageParams): Promise<SendSlackMessageResult>;
}

export class WebhookSlackProvider implements SlackProvider {
  async sendMessage(params: SendSlackMessageParams): Promise<SendSlackMessageResult> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      return { ok: false, error: "slack webhook url is not configured" };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: params.text,
          blocks: params.blocks,
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `slack webhook failed: ${response.status}` };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "slack webhook failed",
      };
    }
  }
}
