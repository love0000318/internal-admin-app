# Annual And Monthly Leave Policy Guide

## Scope

This guide documents the current Internal Ops leave calculation guardrail for fiscal-year prorated leave.

The fiscal-year prorated annual leave described here applies only to employees whose service period is under one year as of the calculation date. It must not change the existing annual leave calculation for employees who have worked for one year or longer.

Company policy and labor-law interpretation still require final review before operational rollout.

## Under-One-Year Fiscal Proration

Policy:

- Fiscal year starts on January 1 and ends on December 31.
- Eligible employees are ACTIVE internal users with a hire date.
- EXTERNAL_PARTNER users are excluded.
- Employees with 365 or more service days are excluded.
- The calculation uses the previous year's worked days.
- Formula: `15 * previousYearWorkedDays / 365`.
- Rounding policy: round up to the nearest half day with `Math.ceil(value * 2) / 2`.

Example:

- Hire date: 2025-09-01
- Fiscal year: 2026
- As-of date: 2026-05-01
- Previous year worked days: 122
- Raw proration: `15 * 122 / 365 = 5.01`
- Rounded proration: 5.5

## Guardrails

- Employees with one year or more of service must return 0 for this under-one-year fiscal proration.
- Historical first-year monthly leave must not be repeated in later fiscal years.
- First-anniversary annual leave must not be repeated in later fiscal years.
- Existing LeaveRequest, LeaveLedger, LeaveGrant, and LeaveAdjustment records must not be deleted by this policy.
- Used leave must be represented as used leave, not as an adjustment.
- Adjustments are limited to manual, import delta, correction, and reverse adjustment use cases.

## Display

For under-one-year employees, screens may show:

- Under-one-year monthly accrual
- Fiscal-year prorated annual leave
- Used
- Pending
- Adjustments
- Remaining

For employees with one year or more of service, existing display and calculation must remain unchanged.

## Regression Cases

Required checks:

- 2019-08-19 hire date, fiscal year 2026: no under-one-year proration, no repeated monthly accrual, no repeated first-anniversary annual leave.
- 2023-06-30 hire date, fiscal year 2026: no under-one-year proration.
- 2024-10-04 hire date, fiscal year 2026 and as-of date after one year of service: existing value remains unchanged.
- 2025-09-01 hire date, fiscal year 2026, as-of date 2026-05-01: prorated annual leave is 5.5.

