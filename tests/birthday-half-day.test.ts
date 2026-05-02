import { describe, expect, it } from "vitest";

import { isAuditRequiredAction } from "@/lib/audit/audit-log";
import {
  calculateBirthdayDateForYear,
  calculateBirthdayHalfDayGrantDate,
  calculateBirthdayHalfDayNominalGrantDate,
  calculateBirthdayHalfDayUsableRange,
  calculatePreviousBusinessDay,
  normalizeBirthdayPolicyInput,
  shouldGrantBirthdayHalfDayToday,
} from "@/lib/leave/birthday-half-day";

describe("birthday half-day helpers", () => {
  it("calculates birthday date for target year and handles Feb 29 in common years", () => {
    expect(calculateBirthdayDateForYear("1995-03-12", 2026)).toBe("2026-03-12");
    expect(calculateBirthdayDateForYear("1996-02-29", 2026)).toBe("2026-02-28");
    expect(calculateBirthdayDateForYear("1996-02-29", 2028)).toBe("2028-02-29");
  });

  it("calculates usable range and nominal grant date", () => {
    expect(calculateBirthdayHalfDayUsableRange("2026-03-12", 7)).toEqual({
      usableFrom: "2026-03-12",
      usableUntil: "2026-03-19",
    });
    expect(calculateBirthdayHalfDayNominalGrantDate("2026-03-12", 1)).toBe(
      "2026-03-11",
    );
  });

  it("moves weekend grant dates to the previous business day", () => {
    expect(calculatePreviousBusinessDay("2026-03-15")).toBe("2026-03-13");
    expect(calculatePreviousBusinessDay("2026-03-14")).toBe("2026-03-13");
  });

  it("moves company holidays and consecutive holidays to the previous business day", () => {
    expect(calculatePreviousBusinessDay("2026-03-11", ["2026-03-11"])).toBe(
      "2026-03-10",
    );
    expect(
      calculatePreviousBusinessDay("2026-03-13", [
        "2026-03-13",
        "2026-03-12",
        "2026-03-11",
      ]),
    ).toBe("2026-03-10");
  });

  it("calculates actual grant date with weekend and holiday adjustment", () => {
    expect(
      calculateBirthdayHalfDayGrantDate({
        birthdayDate: "2026-03-16",
        grantDaysBefore: 1,
      }),
    ).toEqual({
      nominalGrantDate: "2026-03-15",
      actualGrantDate: "2026-03-13",
    });
    expect(
      calculateBirthdayHalfDayGrantDate({
        birthdayDate: "2026-03-12",
        grantDaysBefore: 1,
        companyHolidays: ["2026-03-11"],
      }),
    ).toEqual({
      nominalGrantDate: "2026-03-11",
      actualGrantDate: "2026-03-10",
    });
  });

  it("checks whether a birthday grant should run today", () => {
    expect(
      shouldGrantBirthdayHalfDayToday({
        birthDate: "1995-03-16",
        year: 2026,
        today: "2026-03-13",
      }),
    ).toBe(true);
    expect(
      shouldGrantBirthdayHalfDayToday({
        birthDate: "1995-03-16",
        year: 2026,
        today: "2026-03-15",
      }),
    ).toBe(false);
  });

  it("validates policy input and audit coverage", () => {
    expect(
      normalizeBirthdayPolicyInput({
        isEnabled: true,
        grantAmount: 0.5,
        grantDaysBefore: 1,
        usableDaysFromBirthday: 7,
        adjustGrantDateToPreviousBusinessDay: true,
        notifyEmployee: true,
      }),
    ).toMatchObject({ grantAmount: 0.5, grantDaysBefore: 1 });
    expect(() =>
      normalizeBirthdayPolicyInput({
        isEnabled: true,
        grantAmount: 0,
        grantDaysBefore: 1,
        usableDaysFromBirthday: 7,
        adjustGrantDateToPreviousBusinessDay: true,
        notifyEmployee: true,
      }),
    ).toThrow();
    expect(isAuditRequiredAction("BIRTHDAY_LEAVE_POLICY_UPDATED")).toBe(true);
    expect(isAuditRequiredAction("BIRTHDAY_HALF_DAY_GRANTED")).toBe(true);
    expect(isAuditRequiredAction("BIRTHDAY_HALF_DAY_NOTIFICATION_CREATED")).toBe(
      true,
    );
  });
});
