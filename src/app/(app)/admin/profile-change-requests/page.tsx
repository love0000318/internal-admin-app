import {
  approveProfileChangeRequest,
  rejectProfileChangeRequest,
} from "@/app/(app)/admin/profile-change-requests/actions";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function requestedFieldLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  return Object.keys(value as Record<string, unknown>)
    .filter((key) => !["reason", "sensitiveValuesEncrypted"].includes(key))
    .join(", ");
}

export default async function ProfileChangeRequestsPage() {
  await requireOwner();
  const requests = await getPrisma().employeeProfileChangeRequest.findMany({
    include: {
      user: {
        include: {
          team: true,
        },
      },
      reviewedBy: true,
    },
    orderBy: { requestedAt: "desc" },
    take: 100,
  });

  return (
    <section>
      <p className="text-sm font-medium text-neutral-500">OWNER 전용</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">
        인사정보 수정 요청
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        직원이 제출한 민감정보 변경 요청을 검토합니다. 민감정보 원문은 목록과
        감사 로그에 표시하지 않습니다.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">요청자</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">섹션</th>
              <th className="px-4 py-3">요청 필드</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">요청일</th>
              <th className="px-4 py-3">검토</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requests.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={7}>
                  등록된 수정 요청이 없습니다.
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="align-top">
                  <td className="px-4 py-3">{request.user.name}</td>
                  <td className="px-4 py-3">{request.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">{request.section}</td>
                  <td className="px-4 py-3">
                    {requestedFieldLabels(request.requestedChanges)}
                  </td>
                  <td className="px-4 py-3">{request.status}</td>
                  <td className="px-4 py-3">{formatDate(request.requestedAt)}</td>
                  <td className="px-4 py-3">
                    {request.status === "PENDING" ? (
                      <div className="grid gap-2">
                        <form action={approveProfileChangeRequest}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <button className="h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                            승인
                          </button>
                        </form>
                        <form action={rejectProfileChangeRequest} className="flex gap-2">
                          <input type="hidden" name="requestId" value={request.id} />
                          <input
                            name="reviewComment"
                            placeholder="반려 사유"
                            className="h-9 rounded-md border border-neutral-300 px-2 text-sm"
                            required
                          />
                          <button className="h-9 rounded-md border border-red-200 px-3 text-sm text-red-700">
                            반려
                          </button>
                        </form>
                      </div>
                    ) : (
                      request.reviewedBy?.name ?? "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
