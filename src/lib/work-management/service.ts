import { Prisma } from "@/generated/prisma/client";
import type { WorkTaskInternalStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";
import { createInAppNotification } from "@/lib/notifications/notifications";

type WorkManagementTx = Prisma.TransactionClient;

type UpdateWorkTaskLocalStateInput = {
  actorUserId: string;
  taskMirrorId: string;
  internalStatus: WorkTaskInternalStatus;
  teamId: string | null;
  workDate: Date | null;
  memo: string | null;
};

type CreateWorkTaskChangeRequestInput = {
  actorUserId: string;
  taskMirrorId: string;
  docMirrorId: string | null;
  title: string;
  content: string;
  sourceDocumentUrl: string | null;
};

function cleanText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function dateOnlyString(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function localStateAuditSnapshot(value: {
  internalStatus?: WorkTaskInternalStatus | null;
  teamId?: string | null;
  workDate?: Date | null;
  memo?: string | null;
}) {
  return {
    internalStatus: value.internalStatus ?? null,
    teamId: value.teamId ?? null,
    workDate: dateOnlyString(value.workDate),
    hasMemo: Boolean(value.memo),
  };
}

async function notifyActiveOwners(
  prisma: WorkManagementTx,
  params: {
    title: string;
    message: string;
    linkUrl: string;
    metadata: Prisma.InputJsonValue;
  },
) {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    owners.map((owner) =>
      createInAppNotification({
        prisma,
        userId: owner.id,
        type: "SYSTEM",
        priority: "NORMAL",
        title: params.title,
        message: params.message,
        linkUrl: params.linkUrl,
        metadata: params.metadata,
      }),
    ),
  );
}

export async function updateWorkTaskLocalState(input: UpdateWorkTaskLocalStateInput) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const task = await tx.clickUpTaskMirror.findUnique({
      where: { id: input.taskMirrorId },
      include: { localState: true },
    });

    if (!task) {
      throw new Error("Task mirror not found.");
    }

    if (input.teamId) {
      const team = await tx.team.findFirst({
        where: { id: input.teamId, status: "ACTIVE" },
        select: { id: true },
      });

      if (!team) {
        throw new Error("Team not found.");
      }
    }

    const memo = cleanText(input.memo, 2000);
    const beforeSnapshot = task.localState
      ? localStateAuditSnapshot(task.localState)
      : null;
    const localState = await tx.workTaskLocalState.upsert({
      where: { clickUpTaskMirrorId: task.id },
      create: {
        clickUpTaskMirrorId: task.id,
        internalStatus: input.internalStatus,
        teamId: input.teamId,
        workDate: input.workDate,
        memo,
        updatedByUserId: input.actorUserId,
      },
      update: {
        internalStatus: input.internalStatus,
        teamId: input.teamId,
        workDate: input.workDate,
        memo,
        updatedByUserId: input.actorUserId,
      },
    });
    const afterSnapshot = localStateAuditSnapshot(localState);

    await tx.workTaskActivity.create({
      data: {
        clickUpTaskMirrorId: task.id,
        actorUserId: input.actorUserId,
        type: "LOCAL_STATE_UPDATED",
        message: "업무 내부 상태가 변경되었습니다.",
        metadata: {
          before: beforeSnapshot,
          after: afterSnapshot,
        } satisfies Prisma.JsonObject,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorUserId,
        actorUserId: input.actorUserId,
        action: "WORK_TASK_LOCAL_STATE_UPDATED",
        targetType: "WORK_TASK_LOCAL_STATE",
        targetId: localState.id,
        metadata: {
          clickUpTaskMirrorId: task.id,
          changedFields: ["internalStatus", "teamId", "workDate", "memo"],
          memoStored: Boolean(memo),
        } satisfies Prisma.JsonObject,
        beforeJson: beforeSnapshot ?? Prisma.JsonNull,
        afterJson: afterSnapshot,
      },
    });

    await notifyActiveOwners(tx, {
      title: "업무 상태가 변경되었습니다.",
      message: task.name,
      linkUrl: `/admin/work-management?taskId=${task.id}`,
      metadata: {
        clickUpTaskMirrorId: task.id,
        localStateId: localState.id,
        internalStatus: localState.internalStatus,
      } satisfies Prisma.JsonObject,
    });

    return localState;
  });
}

export async function createWorkTaskChangeRequest(
  input: CreateWorkTaskChangeRequestInput,
) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const [task, document] = await Promise.all([
      tx.clickUpTaskMirror.findUnique({
        where: { id: input.taskMirrorId },
        select: { id: true, name: true },
      }),
      input.docMirrorId
        ? tx.clickUpDocMirror.findUnique({
            where: { id: input.docMirrorId },
            select: { id: true, documentUrl: true, title: true },
          })
        : null,
    ]);

    if (!task) {
      throw new Error("Task mirror not found.");
    }

    if (input.docMirrorId && !document) {
      throw new Error("Document mirror not found.");
    }

    const title = cleanText(input.title, 200);
    const content = cleanText(input.content, 4000);

    if (!title || !content) {
      throw new Error("Change request title and content are required.");
    }

    const changeRequest = await tx.workTaskChangeRequest.create({
      data: {
        clickUpTaskMirrorId: task.id,
        clickUpDocMirrorId: document?.id ?? null,
        title,
        content,
        sourceDocumentUrl:
          cleanText(input.sourceDocumentUrl, 1000) ?? document?.documentUrl ?? null,
        authorOrSource: document ? "CLICKUP_DOC" : "OWNER_INPUT",
      },
    });

    if (document) {
      await tx.workTaskDocumentLink.upsert({
        where: {
          clickUpTaskMirrorId_clickUpDocMirrorId: {
            clickUpTaskMirrorId: task.id,
            clickUpDocMirrorId: document.id,
          },
        },
        create: {
          clickUpTaskMirrorId: task.id,
          clickUpDocMirrorId: document.id,
          linkedByUserId: input.actorUserId,
          source: "CHANGE_REQUEST",
        },
        update: {},
      });
    }

    await tx.workTaskActivity.create({
      data: {
        clickUpTaskMirrorId: task.id,
        actorUserId: input.actorUserId,
        type: "CHANGE_REQUEST_CREATED",
        message: "회의록 기반 변경 요청이 추가되었습니다.",
        metadata: {
          changeRequestId: changeRequest.id,
          clickUpDocMirrorId: document?.id ?? null,
        } satisfies Prisma.JsonObject,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorUserId,
        actorUserId: input.actorUserId,
        action: "WORK_TASK_CHANGE_REQUEST_CREATED",
        targetType: "WORK_TASK_CHANGE_REQUEST",
        targetId: changeRequest.id,
        metadata: {
          clickUpTaskMirrorId: task.id,
          clickUpDocMirrorId: document?.id ?? null,
          hasSourceDocumentUrl: Boolean(changeRequest.sourceDocumentUrl),
        } satisfies Prisma.JsonObject,
      },
    });

    await notifyActiveOwners(tx, {
      title: "업무 변경 요청이 추가되었습니다.",
      message: title,
      linkUrl: `/admin/work-management?taskId=${task.id}`,
      metadata: {
        clickUpTaskMirrorId: task.id,
        changeRequestId: changeRequest.id,
      } satisfies Prisma.JsonObject,
    });

    return changeRequest;
  });
}

export async function acknowledgeWorkTaskChangeRequest(input: {
  actorUserId: string;
  changeRequestId: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.workTaskChangeRequest.findUnique({
      where: { id: input.changeRequestId },
      include: { task: { select: { id: true, name: true } } },
    });

    if (!existing) {
      throw new Error("Change request not found.");
    }

    const changeRequest = await tx.workTaskChangeRequest.update({
      where: { id: existing.id },
      data: {
        status: "ACKNOWLEDGED",
        checkedAt: new Date(),
        checkedByUserId: input.actorUserId,
      },
    });

    await tx.workTaskActivity.create({
      data: {
        clickUpTaskMirrorId: existing.clickUpTaskMirrorId,
        actorUserId: input.actorUserId,
        type: "CHANGE_REQUEST_CHECKED",
        message: "변경 요청이 확인 처리되었습니다.",
        metadata: {
          changeRequestId: changeRequest.id,
        } satisfies Prisma.JsonObject,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorUserId,
        actorUserId: input.actorUserId,
        action: "WORK_TASK_CHANGE_REQUEST_CHECKED",
        targetType: "WORK_TASK_CHANGE_REQUEST",
        targetId: changeRequest.id,
        metadata: {
          clickUpTaskMirrorId: existing.clickUpTaskMirrorId,
          previousStatus: existing.status,
          nextStatus: changeRequest.status,
        } satisfies Prisma.JsonObject,
      },
    });

    return changeRequest;
  });
}
