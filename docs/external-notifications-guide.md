# External Notifications Guide

## Purpose

External notifications extend the existing in-app `Notification` flow. The in-app notification remains the source of truth, and email or Slack delivery is best-effort only. A delivery failure must not block invitations, leave requests, approvals, attachment review, annual leave promotion, or job execution.

## Supported Channels

- Email: Resend in production, console provider for local development only.
- Slack: incoming webhook for selected operational alerts.
- Kakao AlimTalk: not implemented in this phase. It requires provider selection, business profile setup, and template approval.

## Environment Variables

Email:

```txt
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_REPLY_TO=
EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED=true
```

Local development can use:

```txt
EMAIL_PROVIDER=console
EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED=true
```

Slack:

```txt
SLACK_NOTIFICATIONS_ENABLED=false
SLACK_WEBHOOK_URL=
SLACK_NOTIFY_JOB_FAILURES=true
SLACK_NOTIFY_LEAVE_REQUESTS=false
```

Never commit real API keys or webhook URLs. Register production values in Vercel environment variables.

## Email Events

- Employee invitation email: includes the short invitation URL and one-time verification code.
- Leave request created: sends a minimal approval request to approvers.
- Leave approved, rejected, or cancelled: sends a minimal status email to the requester.
- Attachment resubmission requested: asks the requester to check the system.
- Annual leave promotion and use plan reminder: asks the employee to review and submit the use plan.

## Slack Events

Default Slack scope is intentionally narrow:

- Job failure alerts when `SLACK_NOTIFY_JOB_FAILURES=true`.
- Leave request alerts only when `SLACK_NOTIFY_LEAVE_REQUESTS=true`.

Slack messages must not include stack traces, secrets, HR raw rows, attachment file content, or private storage paths.

## Sensitive Data Rules

Do not send the following externally:

- resident registration numbers or foreign registration numbers
- bank account numbers
- password hashes, session tokens, invitation token hashes
- attachment contents, file keys, private paths
- detailed rejection reasons by default
- HR sensitive profile values

Invitation emails are allowed to include the invitation URL and one-time verification code because these are the delivery payload for the invited employee. They must not be stored in AuditLog metadata.

## Failure Handling

External delivery is best-effort. If Resend or Slack fails:

- the core business transaction still succeeds
- the failure is recorded as a sanitized AuditLog entry
- secret values, tokens, webhook URLs, and full email bodies are not logged

## Preflight

`pnpm preflight` checks:

- `EMAIL_PROVIDER`
- `EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED`
- production must not use `EMAIL_PROVIDER=console`
- `RESEND_API_KEY` and `EMAIL_FROM` when Resend email is enabled
- `SLACK_WEBHOOK_URL` when Slack notifications are enabled

## Operations Test

1. Configure Vercel environment variables.
2. Run `pnpm preflight`.
3. Create an invitation with "초대 이메일 발송" enabled.
4. Create a leave request and confirm the approver receives only minimal details.
5. Approve or reject the leave and confirm the requester receives an email.
6. Trigger or simulate a failed job and confirm Slack receives an operational alert.

## Later TODO

- Admin notification settings screen backed by DB settings.
- Retry queue for failed external deliveries.
- Kakao AlimTalk after provider and template approval.
- Per-event recipient preferences.
