import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/session";
import { exactOrigin } from "@/lib/meeting-sso/protocol.mjs";

export const dynamic = "force-dynamic";

export default async function MeetingPage() {
  await requireCurrentUser();

  if (process.env.MEETING_SSO_ENABLED !== "true") {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">회의 녹음</h1>
        <p className="mt-3 text-slate-600">
          회의 서버 연결이 아직 활성화되지 않았습니다. 관리자에게 문의해 주세요.
        </p>
      </main>
    );
  }

  let origin: string;
  try {
    origin = exactOrigin(process.env.MEETING_APP_ORIGIN ?? "");
  } catch {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">회의 녹음</h1>
        <p className="mt-3 text-slate-600">
          회의 서버 주소 설정을 확인해야 합니다.
        </p>
      </main>
    );
  }

  redirect(`${origin}/auth/ops/start`);
}
