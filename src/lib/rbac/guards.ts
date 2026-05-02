import { isLead, isManager, isOwner, type RbacUser } from "@/lib/rbac/roles";
import type { LeaveRequestStatus } from "@/lib/leave/types";

export type ReviewableLeaveRequest = {
  id?: string;
  status: LeaveRequestStatus;
  userId: string;
  user: RbacUser;
};

function isSelf(actor: RbacUser, targetUser: RbacUser) {
  return actor.id === targetUser.id;
}

function isInManagedTeamTree(actor: RbacUser, targetUser: RbacUser) {
  if (!targetUser.teamId) {
    return false;
  }

  // TODO: Build actor.managedTeamIds from Team parent/child relations in DB.
  return actor.managedTeamIds?.includes(targetUser.teamId) ?? false;
}

export function canInviteUser(actor: RbacUser): boolean {
  return isOwner(actor);
}

export function canManageUser(actor: RbacUser, targetUser: RbacUser): boolean {
  if (!isOwner(actor)) {
    return false;
  }

  if (targetUser.role === "EXTERNAL_PARTNER") {
    return false;
  }

  // TODO: Block deactivation or role downgrade when targetUser is the last OWNER.
  return true;
}

export function canManageLeavePolicy(actor: RbacUser): boolean {
  return isOwner(actor);
}

export function canManageLeaveTypes(actor: RbacUser): boolean {
  return isOwner(actor);
}

export function canManageLeaveGrants(actor: RbacUser): boolean {
  return isOwner(actor);
}

export function assertCanManageLeaveTypes(actor: RbacUser): void {
  if (!canManageLeaveTypes(actor)) {
    throw new Error("접근 권한이 없습니다.");
  }
}

export function assertCanManageLeaveGrants(actor: RbacUser): void {
  if (!canManageLeaveGrants(actor)) {
    throw new Error("접근 권한이 없습니다.");
  }
}

export function canReviewLeaveRequest(
  actor: RbacUser,
  requester: RbacUser,
): boolean {
  if (isOwner(actor)) {
    return true;
  }

  if (isLead(actor)) {
    return !isSelf(actor, requester) && isInManagedTeamTree(actor, requester);
  }

  return false;
}

export function canApproveLeaveRequest(
  actor: RbacUser,
  leaveRequest: ReviewableLeaveRequest,
): boolean {
  return (
    leaveRequest.status === "PENDING" &&
    leaveRequest.userId !== actor.id &&
    canReviewLeaveRequest(actor, leaveRequest.user)
  );
}

export function canRejectLeaveRequest(
  actor: RbacUser,
  leaveRequest: ReviewableLeaveRequest,
): boolean {
  return (
    leaveRequest.status === "PENDING" &&
    leaveRequest.userId !== actor.id &&
    canReviewLeaveRequest(actor, leaveRequest.user)
  );
}

export function canCancelApprovedLeaveRequest(
  actor: RbacUser,
  leaveRequest: ReviewableLeaveRequest,
): boolean {
  return (
    leaveRequest.status === "APPROVED" &&
    leaveRequest.userId !== actor.id &&
    canReviewLeaveRequest(actor, leaveRequest.user)
  );
}

export function assertCanReviewLeaveRequest(
  actor: RbacUser,
  leaveRequest: ReviewableLeaveRequest,
): void {
  if (!canReviewLeaveRequest(actor, leaveRequest.user)) {
    throw new Error("접근 권한이 없습니다.");
  }
}

export function canViewLeaveBalance(
  actor: RbacUser,
  targetUser: RbacUser,
): boolean {
  if (isOwner(actor)) {
    return true;
  }

  if (isSelf(actor, targetUser)) {
    return isLead(actor) || isManager(actor);
  }

  if (isLead(actor)) {
    return isInManagedTeamTree(actor, targetUser);
  }

  return false;
}
