import type {
  InvitationStatus,
  LeaveRequestStatus,
  Role,
  TeamStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import type { ReactNode } from "react";
import {
  invitationStatusLabel,
  leaveRequestStatusLabel,
  roleLabel,
  teamStatusLabel,
  userStatusLabel,
} from "@/lib/display/labels";

type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const toneClasses: Record<Tone, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
};

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex min-h-6 max-w-full items-center whitespace-nowrap break-keep rounded-full border px-2 text-xs font-medium leading-tight ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function RoleLabel({ role }: { role: Role }) {
  return <Badge tone={role === "OWNER" ? "blue" : "neutral"}>{roleLabel(role)}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const tone: Tone =
    status === "ACTIVE"
      ? "green"
      : status === "INVITED"
        ? "amber"
        : status === "DEACTIVATED"
          ? "neutral"
          : "red";

  return <Badge tone={tone}>{userStatusLabel(status)}</Badge>;
}

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const tone: Tone =
    status === "PENDING"
      ? "amber"
      : status === "ACCEPTED"
        ? "green"
        : status === "CANCELLED" || status === "REVOKED"
          ? "neutral"
          : "red";

  return <Badge tone={tone}>{invitationStatusLabel(status)}</Badge>;
}

export function TeamStatusBadge({ status }: { status: TeamStatus }) {
  return <Badge tone={status === "ACTIVE" ? "green" : "neutral"}>{teamStatusLabel(status)}</Badge>;
}

export function LeaveRequestStatusBadge({
  status,
}: {
  status: LeaveRequestStatus;
}) {
  const tone: Tone =
    status === "APPROVED"
      ? "green"
      : status === "PENDING"
        ? "amber"
        : status === "REJECTED" || status === "CANCELLED"
          ? "red"
          : "neutral";

  return <Badge tone={tone}>{leaveRequestStatusLabel(status)}</Badge>;
}
