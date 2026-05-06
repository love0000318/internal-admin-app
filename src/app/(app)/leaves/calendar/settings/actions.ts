"use server";

import { redirect } from "next/navigation";

import {
  createCalendarSubscription,
  regenerateCalendarSubscription,
  revokeCalendarSubscription,
} from "@/lib/calendar-subscriptions/service";
import { isCalendarProvider } from "@/lib/calendar-subscriptions/permissions";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

function encodeCreatedUrl(url: string) {
  return encodeURIComponent(url);
}

export async function createCalendarSubscriptionAction(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/calendar");
  const provider = formData.get("provider");

  if (!isCalendarProvider(provider)) {
    redirect("/leaves/calendar/settings?error=invalid-provider");
  }

  const result = await createCalendarSubscription({
    actor,
    scope: "ME",
    provider,
  });
  redirect(`/leaves/calendar/settings?created=${encodeCreatedUrl(result.url)}`);
}

export async function revokeCalendarSubscriptionAction(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/calendar");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");

  if (subscriptionId) {
    await revokeCalendarSubscription({ actor, subscriptionId });
  }

  redirect("/leaves/calendar/settings");
}

export async function regenerateCalendarSubscriptionAction(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/calendar");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");

  if (!subscriptionId) {
    redirect("/leaves/calendar/settings?error=missing-subscription");
  }

  const result = await regenerateCalendarSubscription({ actor, subscriptionId });
  redirect(`/leaves/calendar/settings?created=${encodeCreatedUrl(result.url)}`);
}
