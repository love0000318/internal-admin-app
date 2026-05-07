"use server";

import { redirect } from "next/navigation";

import { features } from "@/config/features";
import {
  createCalendarSubscription,
  isCalendarSubscriptionSchemaError,
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
  if (!features.calendarSubscription) {
    redirect("/leaves/calendar/settings?error=feature-disabled");
  }

  const provider = formData.get("provider");

  if (!isCalendarProvider(provider)) {
    redirect("/leaves/calendar/settings?error=invalid-provider");
  }

  let result;

  try {
    result = await createCalendarSubscription({
      actor,
      scope: "ME",
      provider,
    });
  } catch (error) {
    if (isCalendarSubscriptionSchemaError(error)) {
      redirect("/leaves/calendar/settings?error=db-not-ready");
    }

    throw error;
  }
  redirect(`/leaves/calendar/settings?created=${encodeCreatedUrl(result.url)}`);
}

export async function revokeCalendarSubscriptionAction(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/calendar");
  if (!features.calendarSubscription) {
    redirect("/leaves/calendar/settings?error=feature-disabled");
  }

  const subscriptionId = String(formData.get("subscriptionId") ?? "");

  if (subscriptionId) {
    try {
      await revokeCalendarSubscription({ actor, subscriptionId });
    } catch (error) {
      if (isCalendarSubscriptionSchemaError(error)) {
        redirect("/leaves/calendar/settings?error=db-not-ready");
      }

      throw error;
    }
  }

  redirect("/leaves/calendar/settings");
}

export async function regenerateCalendarSubscriptionAction(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/calendar");
  if (!features.calendarSubscription) {
    redirect("/leaves/calendar/settings?error=feature-disabled");
  }

  const subscriptionId = String(formData.get("subscriptionId") ?? "");

  if (!subscriptionId) {
    redirect("/leaves/calendar/settings?error=missing-subscription");
  }

  let result;

  try {
    result = await regenerateCalendarSubscription({ actor, subscriptionId });
  } catch (error) {
    if (isCalendarSubscriptionSchemaError(error)) {
      redirect("/leaves/calendar/settings?error=db-not-ready");
    }

    throw error;
  }
  redirect(`/leaves/calendar/settings?created=${encodeCreatedUrl(result.url)}`);
}
