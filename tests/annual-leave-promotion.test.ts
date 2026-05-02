import { describe, expect, it } from "vitest";

import {
  calculateAnnualPromotionNoticeDate,
  calculateMonthlyFirstPromotionNoticeDate,
  calculateMonthlySecondPromotionNoticeDate,
  calculateUsePlanReminderDate,
  validateUsePlanItems,
} from "@/lib/leave/annual-promotion";

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
});
