"use client";

import { useMemo, useState } from "react";

import {
  ANNUAL_USE_PLAN_USAGE_TYPES,
  annualUsePlanUsageTypeLabel,
  calculateAnnualUsePlanItemAmount,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import type { DateOnly } from "@/lib/leave/types";

type ItemState = {
  plannedStartDate: string;
  plannedEndDate: string;
  usageType: AnnualUsePlanUsageType;
  memo: string;
};

const EMPTY_ITEM: ItemState = {
  plannedStartDate: "",
  plannedEndDate: "",
  usageType: "FULL_DAY",
  memo: "",
};

function formatAmount(value: number) {
  return Number.isInteger(value) ? `${value}일` : `${value.toFixed(1)}일`;
}

function isDateOnly(value: string): value is DateOnly {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function AnnualUsePlanForm({
  action,
  referenceYear,
  expiringAmount,
  today,
  companyHolidays,
}: {
  action: (formData: FormData) => void | Promise<void>;
  referenceYear: number;
  expiringAmount: number;
  today: DateOnly;
  companyHolidays: DateOnly[];
}) {
  const [items, setItems] = useState<ItemState[]>(
    Array.from({ length: 5 }, () => ({ ...EMPTY_ITEM })),
  );

  const calculations = useMemo(
    () =>
      items.map((item) => {
        if (
          !isDateOnly(item.plannedStartDate) ||
          !isDateOnly(item.plannedEndDate)
        ) {
          return { amount: 0, excludedDates: [], error: null };
        }

        try {
          const result = calculateAnnualUsePlanItemAmount({
            startDate: item.plannedStartDate,
            endDate: item.plannedEndDate,
            usageType: item.usageType,
            companyHolidays,
          });

          return {
            amount: result.amount,
            excludedDates: result.excludedDates,
            error: null,
          };
        } catch (error) {
          return {
            amount: 0,
            excludedDates: [],
            error: error instanceof Error ? error.message : "계산할 수 없습니다.",
          };
        }
      }),
    [companyHolidays, items],
  );
  const totalAmount = calculations.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const remainingAmount = Math.max(0, expiringAmount - totalAmount);

  function updateItem(index: number, next: Partial<ItemState>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...next } : item,
      ),
    );
  }

  return (
    <form
      action={action}
      className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <input name="referenceYear" type="hidden" value={referenceYear} />
      <div>
        <h2 className="text-base font-semibold">사용계획 입력</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
          시작일과 종료일을 입력하면 차감 수량은 자동 계산됩니다. 사용계획
          제출은 실제 휴가 신청이 아니며, 휴가를 사용하려면 별도 휴가 요청을
          등록해야 합니다.
        </p>
      </div>

      <div className="grid gap-3 rounded-md bg-neutral-50 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-neutral-500">소멸 예정 연차</p>
          <p className="mt-1 font-semibold">{formatAmount(expiringAmount)}</p>
        </div>
        <div>
          <p className="text-neutral-500">입력한 사용계획</p>
          <p className="mt-1 font-semibold">{formatAmount(totalAmount)}</p>
        </div>
        <div>
          <p className="text-neutral-500">남은 계획 가능 수량</p>
          <p className="mt-1 font-semibold">{formatAmount(remainingAmount)}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {items.map((item, index) => (
          <section
            key={index}
            className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">사용계획 {index + 1}</h3>
              <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                자동 계산: {formatAmount(calculations[index].amount)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm">
                시작일
                <input
                  name={`plannedStartDate_${index}`}
                  type="date"
                  min={today}
                  value={item.plannedStartDate}
                  onChange={(event) =>
                    updateItem(index, {
                      plannedStartDate: event.target.value,
                    })
                  }
                  className="mt-1 h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3"
                />
              </label>
              <label className="text-sm">
                종료일
                <input
                  name={`plannedEndDate_${index}`}
                  type="date"
                  min={today}
                  value={item.plannedEndDate}
                  onChange={(event) =>
                    updateItem(index, {
                      plannedEndDate: event.target.value,
                    })
                  }
                  className="mt-1 h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3"
                />
              </label>
              <label className="text-sm">
                사용 형태
                <select
                  name={`usageType_${index}`}
                  value={item.usageType}
                  onChange={(event) =>
                    updateItem(index, {
                      usageType: event.target.value as AnnualUsePlanUsageType,
                    })
                  }
                  className="mt-1 h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3"
                >
                  {ANNUAL_USE_PLAN_USAGE_TYPES.map((usageType) => (
                    <option key={usageType} value={usageType}>
                      {annualUsePlanUsageTypeLabel(usageType)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                메모
                <input
                  name={`memo_${index}`}
                  value={item.memo}
                  onChange={(event) =>
                    updateItem(index, { memo: event.target.value })
                  }
                  className="mt-1 h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3"
                  placeholder="선택"
                />
              </label>
            </div>
            {calculations[index].error ? (
              <p className="text-xs text-red-600">{calculations[index].error}</p>
            ) : null}
            {calculations[index].excludedDates.length > 0 ? (
              <p className="text-xs leading-relaxed text-neutral-500">
                차감 제외일: {calculations[index].excludedDates.join(", ")}
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <label className="text-sm">
        전체 메모
        <textarea
          name="memo"
          className="mt-1 min-h-20 w-full rounded-md border border-neutral-300 px-3 py-2"
          maxLength={1000}
        />
      </label>
      <button className="h-10 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white sm:w-auto sm:justify-self-start">
        사용계획 제출
      </button>
    </form>
  );
}
