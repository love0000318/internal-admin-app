# Leave Balance Integrity Audit Guide

## Purpose

This guide lists dry-run checks operators should perform before trusting or applying leave balance changes.

Do not delete existing LeaveRequest, LeaveLedger, LeaveGrant, or LeaveAdjustment rows as part of these checks. Unclear cases should be marked REVIEW_REQUIRED.

## Under-One-Year Proration Checks

Review these cases:

- ACTIVE internal employee with hire date and service days under 365 should have fiscal-year prorated annual leave when the hire date falls in the previous year.
- Employee with service days 365 or higher should not receive under-one-year fiscal proration.
- EXTERNAL_PARTNER users should not receive internal leave proration.
- Previous-year worked days should be calculated inclusively.
- `2025-09-01` through `2025-12-31` must equal 122 days.
- Half-day ceiling must use `Math.ceil(value * 2) / 2`.

## Regression Checks

Flag these as REVIEW_REQUIRED:

- One-year-or-more employee has under-one-year proration greater than 0.
- One-year-or-more employee has repeated first-year monthly accrual in the current fiscal year.
- One-year-or-more employee has repeated first-anniversary annual leave in the current fiscal year.
- Used leave appears as a negative adjustment.
- Adjustment amount looks like an imported remaining balance rather than a delta.
- Remaining balance changes for a one-year-or-more employee after this policy patch.

Protected regression baselines:

- 2025-09-01 hire date, fiscal year 2026, as-of 2026-05-01: 122 worked days in 2025, 5.5 prorated annual days, 8 monthly days, 3 used days, 0 adjustment days, 10.5 remaining days.
- 2019-08-19 hire date, fiscal year 2026: no under-one-year proration and no repeated first-year monthly or first-anniversary annual leave.
- 2023-06-30 hire date, fiscal year 2026: no under-one-year proration and no repeated first-year monthly or first-anniversary annual leave.
- Any restoration of profile, calendar, mobile drawer, reporting, attendance, cleanup, or optimization work must preserve these baselines.

## Safe Operating Policy

- Dry-run first.
- Do not auto-apply unclear corrections.
- Do not create historical LeaveRequest rows automatically from imported used values.
- Use correction adjustment only when the operator has verified the cause.
- Record any labor-policy uncertainty as REVIEW_REQUIRED.
