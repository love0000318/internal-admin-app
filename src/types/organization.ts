import type { Role } from "@/types/roles";

export type UserStatus = "INVITED" | "ACTIVE" | "DEACTIVATED";

export type TeamDraft = {
  id: string;
  name: string;
  parentId: string | null;
  leadId: string | null;
};

export type UserDraft = {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: Date | null;
};

export type EmployeeProfileDraft = {
  id: string;
  userId: string;
  teamId: string | null;
  jobTitle: string | null;
  hireDate: Date | null;
  birthday: Date | null;
  deactivatedAt: Date | null;
};

export type OrganizationAccessScope =
  | { kind: "all"; role: "OWNER" }
  | { kind: "managed-team-tree"; role: "LEAD"; rootTeamId: string }
  | { kind: "self"; role: "MANAGER"; userId: string }
  | { kind: "future-external"; role: "EXTERNAL_PARTNER" };
