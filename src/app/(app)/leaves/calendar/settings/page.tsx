import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import {
  type CalendarSubscriptionWithTeam,
  getCalendarSubscriptionStatus,
  listCalendarSubscriptions,
} from "@/lib/calendar-subscriptions/service";
import {
  canCreateCalendarSubscription,
  getCalendarSubscriptionScopeLabel,
} from "@/lib/calendar-subscriptions/permissions";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

import {
  createCalendarSubscriptionAction,
  regenerateCalendarSubscriptionAction,
  revokeCalendarSubscriptionAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ created?: string; error?: string }>;
};

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function SubscriptionCard({
  subscription,
}: {
  subscription: CalendarSubscriptionWithTeam;
}) {
  const status = getCalendarSubscriptionStatus(subscription);
  const isActive = status === "사용 가능";

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            {subscription.name ?? getCalendarSubscriptionScopeLabel(subscription.scope)}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {getCalendarSubscriptionScopeLabel(subscription.scope)}
            {subscription.team ? ` · ${subscription.team.name}` : ""}
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-medium ${
            isActive
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-neutral-200 bg-neutral-50 text-neutral-600"
          }`}
        >
          {status}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-neutral-600 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-neutral-400">생성일</dt>
          <dd>{formatDateTime(subscription.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">마지막 사용</dt>
          <dd>{formatDateTime(subscription.lastUsedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">만료일</dt>
          <dd>{formatDateTime(subscription.expiresAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <form action={regenerateCalendarSubscriptionAction}>
          <input type="hidden" name="subscriptionId" value={subscription.id} />
          <button className="h-10 w-full rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:w-auto">
            재발급
          </button>
        </form>
        {isActive ? (
          <form action={revokeCalendarSubscriptionAction}>
            <input type="hidden" name="subscriptionId" value={subscription.id} />
            <button className="h-10 w-full rounded-md border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50 sm:w-auto">
              비활성화
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export default async function CalendarSubscriptionSettingsPage({
  searchParams,
}: PageProps) {
  const actor = await requireRouteAccess("/leaves/calendar");
  const params = await searchParams;
  const subscriptions = await listCalendarSubscriptions(actor.id);
  const createdUrl = params.created ? decodeURIComponent(params.created) : null;
  const availableScopes = [
    "ME",
    "TEAM",
    "MANAGED_TEAMS",
    "ALL_COMPANY",
  ] as const;
  const creatableScopes = availableScopes.filter((scope) =>
    canCreateCalendarSubscription(actor, scope) &&
    (scope !== "TEAM" || Boolean(actor.teamId)) &&
    (scope !== "MANAGED_TEAMS" || actor.role === "LEAD"),
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">외부 캘린더 연동</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            iCal/ICS 구독 링크
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
            승인된 휴가 일정을 Google Calendar, Apple Calendar, Samsung Calendar에서
            읽기 전용으로 확인할 수 있습니다. 구독 링크를 아는 사람은 일정 정보를 볼 수
            있으므로 외부에 공유하지 마세요.
          </p>
        </div>
        <Link
          href="/leaves/calendar"
          className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          휴가 캘린더로 돌아가기
        </Link>
      </div>

      {createdUrl ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">
            새 구독 링크가 생성되었습니다.
          </p>
          <p className="mt-1 text-sm text-blue-800">
            이 URL은 지금 복사해 캘린더 앱에 추가하세요. 원문 토큰은 다시 표시되지
            않습니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={createdUrl}
              className="h-10 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-3 text-sm"
            />
            <CopyButton value={createdUrl} />
          </div>
        </div>
      ) : null}

      {params.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          구독 링크 요청을 처리하지 못했습니다. 권한과 입력값을 확인해 주세요.
        </p>
      ) : null}

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-900">구독 링크 생성</h2>
        <p className="mt-1 text-sm text-neutral-500">
          외부 캘린더에는 승인 완료 휴가만 표시되며, 휴가 사유와 증명자료 정보는 포함되지
          않습니다.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {creatableScopes.map((scope) => (
            <form key={scope} action={createCalendarSubscriptionAction}>
              <input type="hidden" name="scope" value={scope} />
              <button className="h-11 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                {getCalendarSubscriptionScopeLabel(scope)} 생성
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-900">캘린더 앱 추가 방법</h2>
        <div className="mt-3 grid gap-3 text-sm leading-relaxed text-neutral-600 lg:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="font-medium text-neutral-900">Google Calendar</p>
            <p className="mt-1">
              웹에서 “다른 캘린더 +” → “URL로 추가”를 선택한 뒤 구독 링크를 붙여넣으세요.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="font-medium text-neutral-900">Apple Calendar</p>
            <p className="mt-1">
              iPhone/iPad에서는 “캘린더 추가” → “구독 캘린더 추가”에서 URL을 입력하세요.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="font-medium text-neutral-900">Samsung Calendar</p>
            <p className="mt-1">
              앱에서 URL 구독 메뉴가 보이지 않으면 Google Calendar 웹에 URL을 추가한 뒤
              Google 계정을 동기화해 주세요.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <h2 className="text-base font-semibold text-neutral-900">기존 구독 링크</h2>
        {subscriptions.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-sm text-neutral-500">
            생성된 외부 캘린더 구독 링크가 없습니다.
          </p>
        ) : (
          subscriptions.map((subscription) => (
            <SubscriptionCard key={subscription.id} subscription={subscription} />
          ))
        )}
      </div>
    </section>
  );
}
