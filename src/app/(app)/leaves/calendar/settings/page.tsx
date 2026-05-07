import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { featureUnavailableMessage, features } from "@/config/features";
import {
  CALENDAR_PROVIDERS,
  getCalendarProviderFromName,
  getCalendarProviderLabel,
} from "@/lib/calendar-subscriptions/permissions";
import {
  type CalendarSubscriptionWithTeam,
  getCalendarSubscriptionStatus,
  listCalendarSubscriptionsSafe,
} from "@/lib/calendar-subscriptions/service";
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

const ONE_WAY_NOTICE =
  "외부 캘린더 연동은 구독 방식의 단방향 동기화입니다. Internal Ops에서 생성된 휴가와 이벤트만 외부 캘린더에 표시됩니다. 외부 캘린더에서 추가하거나 수정한 일정은 Internal Ops에 반영되지 않습니다.";

const providerGuides = [
  {
    title: "Google Calendar",
    description:
      "Google Calendar에서 다른 캘린더 추가를 선택한 뒤 URL로 추가 메뉴에 구독 URL을 붙여넣습니다. Google의 갱신 주기에 따라 반영이 지연될 수 있습니다.",
  },
  {
    title: "Apple Calendar",
    description:
      "iPhone 또는 macOS 캘린더 앱에서 새 캘린더 구독 추가를 선택하고 구독 URL을 입력합니다. OS 버전에 따라 메뉴명이 다를 수 있습니다.",
  },
  {
    title: "Samsung Calendar",
    description:
      "Samsung Calendar는 직접 URL 구독이 제한될 수 있습니다. Google Calendar에 먼저 구독 URL을 추가한 뒤 Samsung Calendar에서 Google 계정을 동기화하세요.",
  },
  {
    title: "Outlook Calendar",
    description:
      "Outlook에서 인터넷 캘린더 구독 또는 웹에서 구독 캘린더 추가를 선택한 뒤 URL을 붙여넣습니다.",
  },
  {
    title: "기타 iCal 지원 앱",
    description:
      "iCal 또는 ICS URL 구독을 지원하는 앱에서 사용할 수 있습니다. 앱별 갱신 주기에 따라 일정 반영과 삭제가 늦어질 수 있습니다.",
  },
];

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

function toWebcalUrl(url: string) {
  return url.replace(/^https?:\/\//, "webcal://");
}

function statusBadge(status: ReturnType<typeof getCalendarSubscriptionStatus>) {
  if (status === "ACTIVE") {
    return <Badge tone="success">활성</Badge>;
  }

  if (status === "EXPIRED") {
    return <Badge tone="warning">만료됨</Badge>;
  }

  return <Badge>해제됨</Badge>;
}

function SubscriptionCard({
  subscription,
}: {
  subscription: CalendarSubscriptionWithTeam;
}) {
  const status = getCalendarSubscriptionStatus(subscription);
  const provider = getCalendarProviderFromName(subscription.name);
  const isActive = status === "ACTIVE";

  return (
    <Card className="space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-keep text-base font-bold text-slate-950">
            {getCalendarProviderLabel(provider)}
          </p>
          <p className="mt-1 break-keep text-sm text-slate-500">
            개인 iCal 구독 URL
          </p>
        </div>
        {statusBadge(status)}
      </div>

      <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-400">생성일</dt>
          <dd className="mt-1 break-words">{formatDateTime(subscription.createdAt)}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-400">최근 접근</dt>
          <dd className="mt-1 break-words">{formatDateTime(subscription.lastUsedAt)}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-400">해제일</dt>
          <dd className="mt-1 break-words">{formatDateTime(subscription.revokedAt)}</dd>
        </div>
      </dl>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <form action={regenerateCalendarSubscriptionAction}>
          <input type="hidden" name="subscriptionId" value={subscription.id} />
          <button
            type="submit"
            className={buttonClassName({
              tone: "neutral",
              className: "w-full sm:w-auto",
            })}
          >
            URL 재발급
          </button>
        </form>
        {isActive ? (
          <form action={revokeCalendarSubscriptionAction}>
            <input type="hidden" name="subscriptionId" value={subscription.id} />
            <button
              type="submit"
              className={buttonClassName({
                tone: "danger",
                className: "w-full sm:w-auto",
              })}
            >
              연동 해제
            </button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

export default async function CalendarSubscriptionSettingsPage({
  searchParams,
}: PageProps) {
  const actor = await requireRouteAccess("/leaves/calendar");
  const params = await searchParams;

  if (!features.calendarSubscription) {
    return <CalendarSubscriptionUnavailableNotice />;
  }

  const subscriptions = await listCalendarSubscriptionsSafe(actor.id);
  const createdUrl = params.created ? decodeURIComponent(params.created) : null;
  const webcalUrl = createdUrl ? toWebcalUrl(createdUrl) : null;

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="외부 캘린더 연동"
        title="iCal/ICS 구독 설정"
        description="개인 휴가 일정을 Google, Apple, Samsung, Outlook 등 iCal 지원 캘린더에 단방향 구독 URL로 연결합니다."
        actions={[{ href: "/leaves/calendar", label: "휴가 캘린더로 돌아가기" }]}
      />

      <Card className="border-blue-200 bg-blue-50">
        <p className="break-keep text-sm font-bold text-blue-950">
          단방향 구독 안내
        </p>
        <p className="mt-2 break-keep text-sm leading-relaxed text-blue-900">
          {ONE_WAY_NOTICE}
        </p>
      </Card>

      {createdUrl ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm font-bold text-emerald-950">
            새 구독 URL이 발급되었습니다.
          </p>
          <p className="mt-2 break-keep text-sm leading-relaxed text-emerald-900">
            이 URL은 지금만 확인할 수 있습니다. 외부 캘린더에 추가한 뒤 외부에 공유하지 마세요.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-emerald-900">
                HTTPS 구독 URL
              </label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  readOnly
                  value={createdUrl}
                  className="min-h-11 min-w-0 rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800"
                />
                <CopyButton value={createdUrl} />
              </div>
            </div>
            {webcalUrl ? (
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-emerald-900">
                  webcal 링크
                </label>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    readOnly
                    value={webcalUrl}
                    className="min-h-11 min-w-0 rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800"
                  />
                  <Link
                    href={webcalUrl}
                    className={buttonClassName({
                      tone: "neutral",
                      className: "w-full sm:w-auto",
                    })}
                  >
                    열기
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {params.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          구독 URL 요청을 처리하지 못했습니다. 캘린더 프로그램 선택값과 권한을 확인해 주세요.
        </p>
      ) : null}

      <Card>
        <div className="min-w-0">
          <h2 className="break-keep text-lg font-bold text-slate-950">
            구독 URL 발급
          </h2>
          <p className="mt-2 break-keep text-sm leading-relaxed text-slate-600">
            승인된 내 휴가만 ICS feed에 포함됩니다. 반려, 취소, 철회, 승인 대기 휴가는 제외됩니다.
          </p>
        </div>
        <form action={createCalendarSubscriptionAction} className="mt-4 grid gap-4">
          <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <legend className="sr-only">캘린더 프로그램 선택</legend>
            {CALENDAR_PROVIDERS.map((provider, index) => (
              <label
                key={provider}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider}
                  defaultChecked={index === 0}
                  className="h-4 w-4"
                />
                <span className="break-keep">{getCalendarProviderLabel(provider)}</span>
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            className={buttonClassName({ className: "w-full sm:w-fit" })}
          >
            구독 URL 생성
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="break-keep text-lg font-bold text-slate-950">
          보안 안내
        </h2>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-slate-600">
          <li>구독 URL은 개인 일정 정보를 볼 수 있는 비밀 링크입니다.</li>
          <li>URL을 외부에 공유하지 마세요.</li>
          <li>유출이 의심되면 즉시 URL을 재발급하세요.</li>
          <li>연동 해제 후에도 외부 캘린더 앱에서는 사용자가 직접 구독 캘린더를 삭제해야 할 수 있습니다.</li>
        </ul>
      </Card>

      <Card>
        <h2 className="break-keep text-lg font-bold text-slate-950">
          프로그램별 연결 방법
        </h2>
        <div className="mt-4 grid gap-3">
          {providerGuides.map((guide) => (
            <details
              key={guide.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <summary className="cursor-pointer break-keep text-sm font-bold text-slate-900">
                {guide.title}
              </summary>
              <p className="mt-3 break-keep text-sm leading-relaxed text-slate-600">
                {guide.description}
              </p>
            </details>
          ))}
        </div>
      </Card>

      <div className="grid gap-3">
        <h2 className="break-keep text-lg font-bold text-slate-950">
          기존 구독 URL
        </h2>
        {subscriptions.length === 0 ? (
          <EmptyState
            title="생성된 외부 캘린더 구독 URL이 없습니다."
            description="캘린더 프로그램을 선택하고 개인 구독 URL을 발급하세요."
          />
        ) : (
          subscriptions.map((subscription) => (
            <SubscriptionCard key={subscription.id} subscription={subscription} />
          ))
        )}
      </div>
    </section>
  );
}

function CalendarSubscriptionUnavailableNotice() {
  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="외부 캘린더 연동"
        title="iCal/ICS 구독 설정"
        description="캘린더 구독 기능은 데이터베이스 준비 상태를 확인한 뒤 다시 사용할 수 있습니다."
        actions={[{ href: "/leaves/calendar", label: "휴가 캘린더로 돌아가기" }]}
      />
      <Card className="border-amber-200 bg-amber-50 text-amber-900">
        <p className="font-semibold">{featureUnavailableMessage()}</p>
      </Card>
    </section>
  );
}
