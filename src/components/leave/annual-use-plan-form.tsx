"use client";

import { useMemo, useState } from "react";

import { Badge, buttonClassName, Card } from "@/components/design-system/primitives";
import {
  ANNUAL_USE_PLAN_USAGE_TYPES,
  annualUsePlanUsageTypeLabel,
  calculateAnnualUsePlanItemAmount,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import type { DateOnly } from "@/lib/leave/types";

type ItemState = {
  id: number;
  plannedStartDate: string;
  plannedEndDate: string;
  usageType: AnnualUsePlanUsageType;
  memo: string;
};

function createEmptyItem(id: number): ItemState {
  return {
    id,
    plannedStartDate: "",
    plannedEndDate: "",
    usageType: "FULL_DAY",
    memo: "",
  };
}

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
    Array.from({ length: 5 }, (_, index) => createEmptyItem(index)),
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
            error:
              error instanceof Error
                ? error.message
                : "사용계획 수량을 계산할 수 없습니다.",
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

  function updateItem(id: number, next: Partial<Omit<ItemState, "id">>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...next } : item)),
    );
  }

  function addItem() {
    setItems((current) => {
      const nextId =
        current.reduce((maxId, item) => Math.max(maxId, item.id), -1) + 1;
      return [...current, createEmptyItem(nextId)];
    });
  }

  function removeItem(id: number) {
    setItems((current) =>
      current.length <= 1 ? current : current.filter((item) => item.id !== id),
    );
  }

  return (
    <Card className="mt-6 p-0">
      <form action={action} className="grid gap-5 p-4 sm:p-5">
        <input name="referenceYear" type="hidden" value={referenceYear} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold break-keep text-slate-950">
            사용계획 입력
          </h2>
          <p className="mt-1 text-sm leading-relaxed break-keep text-slate-500">
            시작일과 종료일을 입력하면 차감 수량을 자동 계산합니다.
            사용계획 제출은 실제 휴가 요청이 아니며, 휴가를 사용하려면
            별도로 휴가 요청을 등록해야 합니다.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <p className="break-keep text-slate-500">소멸 예정 연차</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatAmount(expiringAmount)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="break-keep text-slate-500">입력한 사용계획</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatAmount(totalAmount)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="break-keep text-slate-500">남은 계획 가능 수량</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatAmount(remainingAmount)}
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {items.map((item, index) => {
            const calculation = calculations[index];
            const canRemove = items.length > 1;

            return (
              <section
                key={item.id}
                className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <input name="itemIndex" type="hidden" value={item.id} />
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold break-keep text-slate-950">
                    사용계획 {index + 1}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">
                      자동 계산: {formatAmount(calculation.amount)}
                    </Badge>
                    {canRemove ? (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-sm font-medium break-keep text-slate-800">
                    시작일
                    <input
                      name={`plannedStartDate_${item.id}`}
                      type="date"
                      min={today}
                      value={item.plannedStartDate}
                      onChange={(event) =>
                        updateItem(item.id, {
                          plannedStartDate: event.target.value,
                        })
                      }
                      className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-medium break-keep text-slate-800">
                    종료일
                    <input
                      name={`plannedEndDate_${item.id}`}
                      type="date"
                      min={today}
                      value={item.plannedEndDate}
                      onChange={(event) =>
                        updateItem(item.id, {
                          plannedEndDate: event.target.value,
                        })
                      }
                      className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3"
                    />
                  </label>
                  <label className="text-sm font-medium break-keep text-slate-800">
                    사용 형태
                    <select
                      name={`usageType_${item.id}`}
                      value={item.usageType}
                      onChange={(event) =>
                        updateItem(item.id, {
                          usageType: event.target.value as AnnualUsePlanUsageType,
                        })
                      }
                      className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3"
                    >
                      {ANNUAL_USE_PLAN_USAGE_TYPES.map((usageType) => (
                        <option key={usageType} value={usageType}>
                          {annualUsePlanUsageTypeLabel(usageType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium break-keep text-slate-800">
                    메모
                    <input
                      name={`memo_${item.id}`}
                      value={item.memo}
                      onChange={(event) =>
                        updateItem(item.id, { memo: event.target.value })
                      }
                      className="mt-1 h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3"
                      placeholder="선택"
                    />
                  </label>
                </div>
                {calculation.error ? (
                  <p className="text-xs leading-relaxed break-keep text-red-600">
                    {calculation.error}
                  </p>
                ) : null}
                {calculation.excludedDates.length > 0 ? (
                  <p className="text-xs leading-relaxed break-keep text-slate-500">
                    차감 제외일: {calculation.excludedDates.join(", ")}
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
        >
          사용계획 추가
        </button>

        <label className="text-sm font-medium break-keep text-slate-800">
          전체 메모
          <textarea
            name="memo"
            className="mt-1 min-h-24 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2"
            maxLength={1000}
          />
        </label>
        <button
          className={buttonClassName({
            className: "min-h-11 w-full sm:w-auto",
          })}
        >
          사용계획 제출
        </button>
      </form>
    </Card>
  );
}
