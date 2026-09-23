import type { KeyObject } from "node:crypto";

export function exactOrigin(value: string): string;
export function secretEqual(a: string, b: string): boolean;
export function signingKey(pem: string): KeyObject;
export function publicPem(key: KeyObject): string | Buffer;
export function makeTicket(
  payload: Record<string, unknown>,
  key: KeyObject,
  keyId: string,
): string;
export function sealReference(
  data: Record<string, unknown>,
  secret: string,
): string;
export function openReference(
  value: string,
  secret: string,
): { sid: string; client: string; until: number };
export function accessFor(
  user: {
    id: string;
    name: string;
    role: string;
    status: string;
    teamId?: string | null;
    managedTeamIds?: string[];
  },
  teamMap: Record<string, string[]>,
  allowedIds: string[],
  rollout: string,
):
  | null
  | {
      sub: string;
      name: string;
      role: "admin" | "recorder";
      teams: string[];
    };
