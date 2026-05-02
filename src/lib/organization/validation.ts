import { z } from "zod";

export const inviteEmployeeSchema = z.object({
  name: z.string().trim().min(1, "이름은 필수입니다."),
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다."),
  title: z.string().trim().optional(),
  role: z.enum(["LEAD", "MANAGER"]),
  teamId: z.string().trim().optional(),
  hireDate: z.string().trim().optional(),
  birthDate: z.string().trim().optional(),
});

export const teamInputSchema = z.object({
  name: z.string().trim().min(1, "팀명은 필수입니다."),
  description: z.string().trim().optional(),
  parentTeamId: z.string().trim().optional(),
  leadUserId: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const employeeUpdateSchema = z.object({
  name: z.string().trim().min(1, "이름은 필수입니다."),
  title: z.string().trim().optional(),
  role: z.enum(["OWNER", "LEAD", "MANAGER", "EXTERNAL_PARTNER"]),
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  teamId: z.string().trim().optional(),
  hireDate: z.string().trim().optional(),
  birthDate: z.string().trim().optional(),
});

export function validateEmail(email: string) {
  return z.string().email().safeParse(email).success;
}

export function normalizeOptionalId(value?: string | null) {
  return value && value.length > 0 ? value : null;
}

export function normalizeOptionalDate(value?: string | null) {
  return value && value.length > 0 ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function isFutureDateOnly(value: string, today: string) {
  return value > today;
}
