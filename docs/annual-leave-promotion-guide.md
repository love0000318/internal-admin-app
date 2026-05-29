# 연차 촉진·사용계획·소멸 운영 가이드

## 목적

연차 촉진 기능은 소멸 예정 연차를 구성원에게 안내하고, 구성원이 사용계획을 제출하도록 돕는 운영 보조 기능이다. 이 기능은 법적 판단을 대체하지 않으며, 실제 운영 전 회사 정책과 노무 검토가 필요하다.

## 현재 회사 설정값

- 회계일: 1월 1일
- 연차 사용 단위: 반차 단위
- 당겨쓰기: 허용하지 않음
- 연차/월차 소멸: 사용
- 기본 소멸 기간: 12개월
- 이월: 기본 미허용
- 연차 촉진: 사용
- 구성원 작성 리마인드: 사용
- 관리자 작성 리마인드: 사용 안 함
- 사용계획 리마인드: 사용계획일 10일 전
- 1년 이상 재직자 촉진: 소멸 6개월 전
- 1년 미만 재직자 월차 촉진: 소멸 3개월 전, 소멸 1개월 전

## 촉진 대상자 기준

- `User.status = ACTIVE`인 내부 사용자
- `EmploymentProfile.hireDate`, `EmployeeProfile.hireDate`, `User.hireDate` 중 하나가 있는 사용자
- 퇴직일이 있는 사용자는 제외
- 해당 기준 연도에 LeaveLedger 기준 잔여 연차가 0보다 큰 사용자

## 운영 명령

촉진 알림 예정 생성:

```bash
pnpm jobs:schedule-annual-promotion-notices -- --dry-run
pnpm jobs:schedule-annual-promotion-notices -- --year=2026
```

촉진 알림/사용계획 증적 진단:

```bash
pnpm jobs:audit-annual-promotion-readiness -- --year=2026
pnpm jobs:audit-annual-promotion-readiness -- --year=2026 --apply
```

진단 job은 기본 dry-run이며 누락된 예정 알림, 잘못된 알림 링크, 깨진 한글
문구, 제출된 사용계획과 고지 증적 연결 누락을 확인한다. `--apply`는 누락된
스케줄 생성, 알림 링크/문구 보정, 제출 증적 연결만 수행하며 데이터를 삭제하지
않는다.

예정일이 지난 알림을 인앱 Notification으로 발송:

```bash
pnpm jobs:send-annual-promotion-notices
```

연차 소멸 미리보기와 실제 실행:

```bash
pnpm jobs:expire-annual-leaves -- --dry-run
pnpm jobs:expire-annual-leaves
```

## 사용계획 제출

직원은 `/leaves/me/use-plan`에서 연차 사용계획을 제출한다.

- 사용계획은 실제 휴가 요청이 아니다.
- 휴가를 실제로 사용하려면 기존 휴가 요청 화면에서 별도 신청해야 한다.
- 사용계획 항목은 `시작일`, `종료일`, `사용 형태(종일/오전 반차/오후 반차)`, `메모`로 입력한다.
- 직원이 수량을 직접 입력하지 않는다. 시스템이 기간 내 토요일/일요일/회사 휴일을 제외해 자동 계산한다.
- 오전/오후 반차는 시작일과 종료일이 같은 날짜일 때만 제출할 수 있으며 자동 계산 수량은 0.5일이다.
- DRAFT 또는 미제출 상태에서는 제출 가능하다.
- SUBMITTED 상태는 바로 수정할 수 없으며, 필요한 경우 제출 취소 후 다시 제출한다.
- 총 계획 수량은 소멸 예정 연차를 초과할 수 없다.
- SUBMITTED 사용계획이 있는 구성원은 신규 촉진 알림 예정 생성 대상에서 제외한다.

## OWNER 확인 화면

OWNER는 `/admin/leaves/promotions`에서 다음을 확인한다.

- 촉진 대상자 수
- 알림 예정 수
- 알림 발송 완료 수
- 사용계획 제출 완료 수
- 소멸 예정 연차 합계
- 구성원별 알림 상태와 제출 상태

## LeaveLedger 연결

사용계획 제출 자체는 잔여 연차를 차감하지 않는다. 실제 잔여 수량 변화는 기존 휴가 요청/승인 또는 소멸 job에서만 발생한다.

연차 소멸 실행 시에는 다음 장부 이벤트를 기록한다.

- `eventType = EXPIRED`
- `source = ANNUAL_AUTO`
- `idempotencyKey = expire:userId:annual:referenceYear:expirationDate`

중복 실행해도 동일 idempotencyKey로 중복 소멸이 생성되지 않아야 한다.

## 후순위 TODO

- 실제 이메일 발송
- 카카오톡/Slack 알림
- 법정 연차촉진 전자문서 생성
- 관리자 작성 리마인드 자동화
- 근태 기반 개근 여부 판단
- 퇴사자 연차수당 정산
