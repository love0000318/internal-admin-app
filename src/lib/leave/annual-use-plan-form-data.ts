import {
  ANNUAL_USE_PLAN_USAGE_TYPES,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import type { DateOnly } from "@/lib/leave/types";

export type AnnualUsePlanFormItem = {
  plannedStartDate: DateOnly;
  plannedEndDate: DateOnly;
  usageType: AnnualUsePlanUsageType;
  memo: string | null;
};

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function collectItemIndexes(formData: FormData) {
  const indexes = new Set<number>();

  for (const value of formData.getAll("itemIndex")) {
    if (typeof value !== "string") continue;
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) {
      indexes.add(parsed);
    }
  }

  if (indexes.size === 0) {
    for (const key of formData.keys()) {
      const match = /^(?:plannedStartDate|plannedEndDate|usageType|memo)_(\d+)$/.exec(
        key,
      );
      if (!match) continue;
      indexes.add(Number(match[1]));
    }
  }

  return [...indexes].sort((a, b) => a - b);
}

export function parseAnnualUsePlanFormItems(formData: FormData) {
  const items: AnnualUsePlanFormItem[] = [];

  for (const index of collectItemIndexes(formData)) {
    const plannedStartDate = stringValue(formData, `plannedStartDate_${index}`);
    const plannedEndDate = stringValue(formData, `plannedEndDate_${index}`);
    const usageType = stringValue(formData, `usageType_${index}`);
    const memo = stringValue(formData, `memo_${index}`);

    if (!plannedStartDate && !plannedEndDate && !memo) {
      continue;
    }

    if (
      !plannedStartDate ||
      !plannedEndDate ||
      !ANNUAL_USE_PLAN_USAGE_TYPES.includes(usageType as AnnualUsePlanUsageType)
    ) {
      throw new Error("Invalid annual leave use plan item.");
    }

    items.push({
      plannedStartDate: plannedStartDate as DateOnly,
      plannedEndDate: plannedEndDate as DateOnly,
      usageType: usageType as AnnualUsePlanUsageType,
      memo: memo || null,
    });
  }

  return items;
}
