import { describe, expect, it } from "vitest";

import {
  calculateAnnualPromotionNoticeDate,
  calculateMonthlyFirstPromotionNoticeDate,
  calculateMonthlySecondPromotionNoticeDate,
  calculateUsePlanReminderDate,
  validateAnnualUsePlanItems,
  validateUsePlanItems,
} from "@/lib/leave/annual-promotion";
import { parseAnnualUsePlanFormItems } from "@/lib/leave/annual-use-plan-form-data";
import { calculateAnnualUsePlanItemAmount } from "@/lib/leave/annual-use-plan-calculator";

describe("annual leave promotion operations", () => {
  it("calculates annual and monthly promotion notice dates", () => {
    expect(
      calculateAnnualPromotionNoticeDate({
        expirationDate: "2027-12-31",
        monthsBefore: 6,
      }),
    ).toBe("2027-06-30");
    expect(
      calculateMonthlyFirstPromotionNoticeDate({
        expirationDate: "2027-12-31",
        monthsBefore: 3,
      }),
    ).toBe("2027-09-30");
    expect(
      calculateMonthlySecondPromotionNoticeDate({
        expirationDate: "2027-12-31",
        monthsBefore: 1,
      }),
    ).toBe("2027-11-30");
  });

  it("calculates use-plan reminder dates", () => {
    expect(
      calculateUsePlanReminderDate({
        plannedDate: "2026-07-20",
        daysBefore: 10,
      }),
    ).toBe("2026-07-10");
  });

  it("validates use plan total amount and duplicate dates", () => {
    expect(
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 2,
        items: [
          {
            plannedDate: "2026-07-01",
            amount: 0.5,
            halfDayPeriod: "AM",
          },
          {
            plannedDate: "2026-08-01",
            amount: 1,
            halfDayPeriod: null,
          },
        ],
      }),
    ).toBe(1.5);

    expect(() =>
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 1,
        items: [
          {
            plannedDate: "2026-07-01",
            amount: 0.5,
            halfDayPeriod: "AM",
          },
          {
            plannedDate: "2026-07-01",
            amount: 0.5,
            halfDayPeriod: "AM",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects past dates and over-planning", () => {
    expect(() =>
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 2,
        items: [
          {
            plannedDate: "2026-04-30",
            amount: 0.5,
            halfDayPeriod: null,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 1,
        items: [
          {
            plannedDate: "2026-07-01",
            amount: 1.5,
            halfDayPeriod: null,
          },
        ],
      }),
    ).toThrow();
  });

  it("calculates date-range use plan amounts", () => {
    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        usageType: "FULL_DAY",
      }).amount,
    ).toBe(1);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-06",
        endDate: "2026-07-08",
        usageType: "FULL_DAY",
      }).amount,
    ).toBe(3);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-03",
        endDate: "2026-07-06",
        usageType: "FULL_DAY",
      }).amount,
    ).toBe(2);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-05-04",
        endDate: "2026-05-06",
        usageType: "FULL_DAY",
        companyHolidays: ["2026-05-05"],
      }),
    ).toMatchObject({
      amount: 2,
      countedDates: ["2026-05-04", "2026-05-06"],
      excludedDates: ["2026-05-05"],
    });
  });

  it("calculates and validates half-day use plans", () => {
    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        usageType: "AM_HALF_DAY",
      }).amount,
    ).toBe(0.5);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        usageType: "PM_HALF_DAY",
      }).amount,
    ).toBe(0.5);

    expect(() =>
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-02",
        usageType: "AM_HALF_DAY",
      }),
    ).toThrow();
  });

  it("normalizes range use plans and rejects duplicate counted dates", () => {
    const result = validateAnnualUsePlanItems({
      today: "2026-05-01",
      maxAmount: 5,
      items: [
        {
          plannedStartDate: "2026-07-01",
          plannedEndDate: "2026-07-03",
          usageType: "FULL_DAY",
        },
        {
          plannedStartDate: "2026-07-06",
          plannedEndDate: "2026-07-06",
          usageType: "PM_HALF_DAY",
        },
      ],
    });

    expect(result.totalPlannedAmount).toBe(3.5);
    expect(result.items[0]).toMatchObject({
      plannedDate: "2026-07-01",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-03",
      calculatedAmount: 3,
      halfDayPeriod: null,
    });
    expect(result.items[1]).toMatchObject({
      calculatedAmount: 0.5,
      halfDayPeriod: "PM",
    });

    expect(() =>
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: 5,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-02",
            usageType: "FULL_DAY",
          },
          {
            plannedStartDate: "2026-07-02",
            plannedEndDate: "2026-07-02",
            usageType: "AM_HALF_DAY",
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: 1,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-03",
            usageType: "FULL_DAY",
          },
        ],
      }),
    ).toThrow();
  });

  it("parses annual use plan form rows beyond the original five-row draft", () => {
    const formData = new FormData();

    for (let index = 0; index < 6; index += 1) {
      formData.append("itemIndex", String(index));
      formData.set(`plannedStartDate_${index}`, `2026-07-${String(index + 1).padStart(2, "0")}`);
      formData.set(`plannedEndDate_${index}`, `2026-07-${String(index + 1).padStart(2, "0")}`);
      formData.set(`usageType_${index}`, "FULL_DAY");
      formData.set(`memo_${index}`, `plan-${index + 1}`);
    }

    expect(parseAnnualUsePlanFormItems(formData)).toHaveLength(6);
  });

  it("keeps annual use plan validation capped by the provided remaining balance", () => {
    expect(() =>
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: 17,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-24",
            usageType: "FULL_DAY",
          },
        ],
      }),
    ).toThrow();
  });
});
