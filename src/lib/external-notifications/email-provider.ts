export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendEmailResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
};

export interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}
