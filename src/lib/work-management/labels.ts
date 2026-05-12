import type {
  WorkTaskChangeRequestStatus,
  WorkTaskInternalStatus,
} from "@/generated/prisma/enums";

export const WORK_TASK_INTERNAL_STATUS_OPTIONS = [
  "PLANNED",
  "IN_PROGRESS",
  "HOTFIX",
  "DEPLOYED",
] as const satisfies readonly WorkTaskInternalStatus[];

export const WORK_TASK_INTERNAL_STATUS_LABELS: Record<WorkTaskInternalStatus, string> = {
  PLANNED: "진행 예정",
  IN_PROGRESS: "진행 중",
  HOTFIX: "Hotfix",
  DEPLOYED: "배포 완료",
};

export const WORK_TASK_CHANGE_REQUEST_STATUS_LABELS: Record<
  WorkTaskChangeRequestStatus,
  string
> = {
  OPEN: "확인 필요",
  ACKNOWLEDGED: "확인 완료",
  RESOLVED: "해결",
  ARCHIVED: "보관",
};

export function normalizeWorkTaskInternalStatus(
  value: FormDataEntryValue | string | null | undefined,
): WorkTaskInternalStatus | null {
  return WORK_TASK_INTERNAL_STATUS_OPTIONS.includes(value as WorkTaskInternalStatus)
    ? (value as WorkTaskInternalStatus)
    : null;
}

export function getWorkTaskInternalStatusLabel(status: WorkTaskInternalStatus) {
  return WORK_TASK_INTERNAL_STATUS_LABELS[status];
}
