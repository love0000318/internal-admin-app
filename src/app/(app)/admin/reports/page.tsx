import Link from "next/link";

import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

const reportOrder = [
  "LEAVE_USAGE",
  "LEAVE_LEDGER",
  "LEAVE_GRANTS",
  "BIRTHDAY_HALF_DAYS",
  "ANNUAL_PROMOTIONS",
  "LEAVE_ATTACHMENTS",
  "HR_ONBOARDING",
  "PROFILE_CONFIRMATIONS",
] as const;

export default async function AdminReportsPage() {
  await requireOwner();

  return (
    <section className="min-w-0">
      <div className="min-w-0">
        <p className="text-sm font-medium break-keep text-neutral-500">관리자</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal break-keep text-neutral-950 sm:text-3xl">
          관리자 리포트
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed break-keep text-neutral-600">
          휴가, 인사, 온보딩, 증명자료 현황을 확인하고 필요한 데이터를
          안전하게 내보낼 수 있습니다.
        </p>
      </div>

      <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reportOrder.map((reportType) => {
          const report = REPORT_DEFINITIONS[reportType];

          return (
            <Link
              key={report.type}
              href={report.path}
              className="flex min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            >
              <h2 className="text-base font-semibold leading-snug break-keep text-neutral-950 sm:text-lg">
                {report.title}
              </h2>
              <p className="mt-2 min-h-0 text-sm leading-relaxed break-keep text-neutral-600 md:min-h-12">
                {report.description}
              </p>
              <span className="mt-4 inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md bg-neutral-950 px-4 text-sm font-medium text-white sm:w-fit">
                바로가기
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
