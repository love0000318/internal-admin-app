# 연차 정책 운영 가이드

## 목적

이 문서는 2차 휴가 고도화에서 추가된 `AnnualLeavePolicy` 기준을 설명한다. 기존 1차 MVP의 연차/반차 요청과 승인 흐름은 유지하면서, 회사의 연차 부여·소멸·촉진 설정을 데이터로 관리하기 위한 기준이다.

## 현재 회사 기준 기본값

- 부여 기준일: 회계연도 기준
- 회계일: 1월 1일
- 연차 사용 단위: 반차 단위
- 당겨쓰기: 허용하지 않음
- 휴가 등록 시 승인 요청: 사용
- 등록한 휴가 취소 시 승인 요청: 사용 안 함
- 월차 부여: 사용
- 월차 부여량: 매월 개근 시 1일
- 1년 이상자 기본 연차: 15일
- 장기근속 추가 부여: 사용
- 최대 연차 한도: 25일
- 자동 소멸: 사용
- 이월: 허용하지 않음

## 확인이 필요한 항목

첫 회계연도 부여 방식은 현재 자료의 문구가 일부 불명확하므로 기본값을 `NEEDS_CONFIRMATION`으로 둔다. 실제 운영 적용 전 대표와 노무 전문가가 아래 항목을 확인해야 한다.

- 첫 회계연도에 입사월 기준으로 비례 부여할지
- 잔여 월 기준으로 부여할지
- 회사 별도 기준을 둘지
- 1년 미만자 월차의 실제 개근 판단을 근태 시스템과 연동할지

## LeaveLedger 연결 방식

- 연차 자동 부여: `LeaveLedger.eventType = GRANTED`, `source = ANNUAL_AUTO`
- 월차 자동 부여: `LeaveLedger.eventType = GRANTED`, `source = ANNUAL_AUTO`
- 수동 조정: `LeaveAdjustment` 생성 후 `LeaveLedger.eventType = ADJUSTED`
- 휴가 요청: `PENDING`
- 승인: `USED`
- 철회/반려: `WITHDRAWN` 또는 `REJECTED`
- 승인 취소: `CANCELLED`
- 소멸: `EXPIRED`

잔여 계산은 장부 이벤트 합산을 기준으로 통일한다. 기존 `LeaveAdjustment`, `LeaveGrant`, `LeaveRequest`는 삭제하지 않고 장부 이벤트의 원천 데이터로 유지한다.

## 연차 촉진 설정

기본값은 다음과 같다.

- 연차 촉진 사용: 사용
- 구성원 작성 리마인드: 사용
- 관리자 작성 리마인드: 사용 안 함
- 사용 계획 알림 시점: 사용 계획일 10일 전
- 1년 이상자 촉진 시점: 소멸 6개월 전
- 1년 미만자 월차 1차 촉진: 소멸 3개월 전
- 1년 미만자 월차 2차 촉진: 소멸 1개월 전

`pnpm leave:promotion:schedule` 명령은 현재 연차 정책 기준으로 `AnnualLeavePromotionNotice` 일정을 생성하거나 갱신한다. 실제 이메일, 카카오톡, Slack 발송은 아직 구현하지 않는다.

사용계획 제출과 실제 알림 발송, 연차 소멸 운영 절차는 `docs/annual-leave-promotion-guide.md`를 기준으로 한다.

## HR 데이터 활용

입사일은 다음 순서로 조회한다.

1. `EmploymentProfile.hireDate`
2. `EmployeeProfile.hireDate`
3. `User.hireDate`

재직 상태는 `User.status = ACTIVE`를 우선 사용한다. 퇴직자 정산, 연차수당, 연차 촉진 문서 자동화는 3차 이후 범위다.

## 운영 명령

```bash
pnpm db:seed
pnpm leave:ledger:rebuild
pnpm leave:ledger:validate
pnpm leave:promotion:schedule
```

운영 DB에서는 migration 적용 전 백업을 먼저 수행한다. 연차 정책 변경은 AuditLog에 기록된다.
## 회계연도 기준 휴가 소멸일

회계연도 기준으로 지급되는 연차와 연차성 조정 휴가는 지급 기준 연도의 12월 31일까지 유효합니다.

- 2026년 지급 휴가: 2026-12-31 소멸
- 2027년 지급 휴가: 2027-12-31 소멸
- 2028년 지급 휴가: 2028-12-31 소멸

`annualExpirationMonths`와 `monthlyExpirationMonths` 설정값은 기존 정책 데이터와 UI 호환을 위해 유지하지만, 현재 운영 정책에서는 회계연도 지급분의 실제 소멸일을 `referenceYear-12-31`로 계산합니다.

생일 반차처럼 별도 유효기간을 가진 휴가는 이 규칙을 따르지 않습니다. 생일 반차는 생일 당일부터 정책에 설정된 사용 가능 기간까지 기존 방식으로 유지됩니다.

기존 데이터 중 2026년 지급분이 2027-12-31로 저장된 경우에는 먼저 dry-run으로 대상을 확인한 뒤 apply를 실행합니다.

```bash
pnpm jobs:fix-fiscal-year-leave-expirations -- --dry-run --year=2026
pnpm jobs:fix-fiscal-year-leave-expirations -- --apply --year=2026
```
