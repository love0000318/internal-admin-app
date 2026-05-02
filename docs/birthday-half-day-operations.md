# 생일 반차 자동 지급 운영 메모

## 목적

생일 반차 자동 지급 Job이 실제 운영에서 어떤 기준으로 대상자를 찾고, 지급된 반차가 직원 휴가 요청 화면에 어떻게 연결되는지 정리한다.

## 지급 정책

- 휴가 유형: `BIRTHDAY_HALF_DAY`
- 지급 수량: `0.5`일
- 지급 source: `BIRTHDAY_AUTO`
- 지급 예정일: 생일 하루 전
- 사용 가능 기간: 생일 당일 ~ 생일 + 7일
- 지급 예정일이 토요일, 일요일, enabled CompanyHoliday이면 직전 평일로 앞당긴다.
- 같은 직원, 같은 생일 연도, 같은 휴가 유형, `BIRTHDAY_AUTO` source는 중복 지급하지 않는다.

## 생일 조회 우선순위

1. `EmployeeProfile.birthDate`
2. `User.birthDate`
3. 연결된 `EmployeePrejoinProfile.birthDate`
4. 기존 `EmployeeProfile.birthday` fallback

## 실행 방법

```bash
pnpm jobs:birthday-half-day-grants -- --dry-run
pnpm jobs:birthday-half-day-grants -- --date=2026-03-11 --dry-run
pnpm jobs:birthday-half-day-grants -- --date=2026-03-11
```

Vercel Cron endpoint:

```txt
POST /api/cron/birthday-half-day-grants
```

운영 cron 호출은 `CRON_SECRET`을 `X-Cron-Secret` 또는 `Authorization: Bearer` header로 전달해야 한다.

## 휴가 요청 연결

직원 휴가 요청 화면은 사용 가능 기간 안에 있고 잔여가 남은 `BIRTHDAY_AUTO` LeaveGrant를 맞춤휴가 선택지로 보여준다. 생일 반차 요청은 연차를 차감하지 않고 `LeaveGrant.pendingAmount`, `LeaveGrant.usedAmount`, `LeaveGrant.remainingAmount`만 전환한다.

## 점검 포인트

- dry-run 결과의 `dueCount`가 기대 대상자 수와 맞는지 확인한다.
- 지급 후 `/leaves/me`에 생일 반차가 표시되는지 확인한다.
- 지급 후 `/leaves/me/requests/new` 맞춤휴가 선택지에 생일 반차가 표시되는지 확인한다.
- 승인/반려/철회/취소 후 LeaveGrant 수량과 LeaveLedger가 중복 차감 없이 유지되는지 확인한다.
