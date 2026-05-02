# 2차 휴가 고도화 로드맵

## 1. 휴가 유형 모델 정리

목표:

- enum 고정 휴가 유형에서 DB 기반 휴가 유형으로 확장할 준비를 한다.

변경 파일 후보:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/lib/leave/types.ts`
- `src/lib/leave/labels.ts`
- 휴가 정책/요청 server actions

DB migration 필요 여부:

- 필요.

위험도:

- 높음. 기존 `LeaveRequest.type`과 `LeavePolicy.type`이 enum 기반이다.

테스트 항목:

- 기존 5개 휴가 유형 호환성
- 기존 요청 목록/상세 표시
- 정책 조회/수정

완료 기준:

- 기존 1차 휴가 요청/승인 테스트가 모두 통과한다.
- 신규 휴가 유형 row가 기본 seed로 생성된다.

다음 단계 진입 조건:

- enum과 DB 모델 간 mapping 정책 확정.

## 2. 맞춤휴가 생성/수정/비활성화

목표:

- OWNER가 맞춤휴가 유형과 정책을 관리한다.

변경 파일 후보:

- `src/app/(app)/admin/leaves/settings`
- `src/lib/leave/validation.ts`
- `src/lib/audit/audit-log.ts`

DB migration 필요 여부:

- 1단계 모델에 따라 필요.

위험도:

- 중간.

테스트 항목:

- OWNER 생성/수정/비활성화 성공
- MANAGER/LEAD 차단
- AuditLog 기록

완료 기준:

- 맞춤휴가가 비활성화되면 신규 요청이 차단된다.

다음 단계 진입 조건:

- 맞춤휴가 정책 필드 최소 범위 확정.

## 3. 맞춤휴가 직원 지급

목표:

- OWNER가 직원에게 맞춤휴가를 직접 지급한다.

변경 파일 후보:

- `src/app/(app)/admin/leaves/balances`
- `src/lib/leave/balance.ts`
- 신규 지급 action

DB migration 필요 여부:

- 필요. `LeaveGrant` 또는 유사 모델.

위험도:

- 중간.

테스트 항목:

- 지급 성공
- 지급 후 잔여 반영
- 지급 만료일 처리
- AuditLog 기록

완료 기준:

- 직원이 지급받은 맞춤휴가를 내 휴가 현황에서 볼 수 있다.

다음 단계 진입 조건:

- 지급 수량과 만료 정책 결정.

## 4. LeaveLedger 도입

목표:

- 잔여 휴가 변화 이력을 장부로 추적한다.

변경 파일 후보:

- `src/lib/leave/balance.ts`
- 휴가 요청/승인/철회/취소 actions
- 휴가 조정 actions

DB migration 필요 여부:

- 필요.

위험도:

- 높음.

테스트 항목:

- 요청 생성 시 PENDING 이벤트
- 승인 시 USED 이벤트
- 반려/철회 시 PENDING_RELEASED
- 승인 취소 시 CANCELLED
- 조정 시 ADJUSTED

완료 기준:

- 장부와 기존 계산 결과가 일치한다.

다음 단계 진입 조건:

- 기존 데이터 backfill 전략 확정.

## 5. 휴가 요청 화면 개선

목표:

- 휴가 유형별 사용 조건, 잔여, 증빙 안내를 요청 화면에 표시한다.

변경 파일 후보:

- `src/app/(app)/leaves/me/requests/new`
- `src/lib/leave/labels.ts`
- 공통 form component

DB migration 필요 여부:

- 없음 또는 이전 단계 migration 활용.

위험도:

- 낮음.

테스트 항목:

- 유형별 안내 표시
- 증빙 필수 표시
- 비활성 유형 숨김/차단

완료 기준:

- 사용자가 선택 가능한 휴가만 요청할 수 있다.

다음 단계 진입 조건:

- segment 도입 전 UI 흐름 확정.

## 6. LeaveRequestSegment 도입

목표:

- 하나의 휴가 요청에 여러 날짜/단위/차감량을 담는다.

변경 파일 후보:

- `prisma/schema.prisma`
- `src/lib/leave/calculate-business-days.ts`
- `src/lib/leave/overlap.ts`
- 요청 생성/승인 actions

DB migration 필요 여부:

- 필요.

위험도:

- 높음.

테스트 항목:

- full day
- AM/PM half day
- 시간 단위
- 중복 검사
- 회사 휴일 처리

완료 기준:

- 기존 기간 요청과 반차 요청이 segment 기반으로 동일하게 계산된다.

다음 단계 진입 조건:

- 근무시간 정책과 시간 단위 차감 방식 결정.

## 7. 증명자료 metadata 도입

목표:

- 휴가 유형별 증빙 제출 상태를 관리한다.

변경 파일 후보:

- `src/app/(app)/leaves/me/requests/new`
- `src/app/(app)/leaves/me/requests/[requestId]`
- `src/lib/leave/validation.ts`

DB migration 필요 여부:

- 선택. `LeaveAttachment` 모델 도입 시 필요.

위험도:

- 중간.

테스트 항목:

- 요청 전 필수
- 요청 후 제출 가능
- 선택 제출
- 민감정보 마스킹

완료 기준:

- 증빙 정책에 따라 요청 제출 가능 여부가 서버에서 검증된다.

다음 단계 진입 조건:

- 실제 파일 스토리지 도입 여부 결정.

## 8. 연차 정책 고도화

목표:

- 입사일/회계연도 기준 연차 정책을 설정 가능하게 한다.

변경 파일 후보:

- `src/lib/leave/calculate-entitlement.ts`
- `src/app/(app)/admin/leaves/settings`

DB migration 필요 여부:

- 필요.

위험도:

- 높음.

테스트 항목:

- 입사일 기준
- 회계연도 기준
- 1년 미만
- 장기근속
- 최대 한도

완료 기준:

- 노무 검토를 거친 기본 정책이 설정 가능하다.

다음 단계 진입 조건:

- 회사 취업규칙과 최신 법 기준 검토 완료.

## 9. 승인 정책 확장

목표:

- 휴가 유형별 승인 방식을 설정할 수 있게 한다.

변경 파일 후보:

- `src/lib/rbac/guards.ts`
- `src/lib/leave/review.ts`
- 승인 actions

DB migration 필요 여부:

- 필요.

위험도:

- 높음.

테스트 항목:

- 승인 불필요
- OWNER 승인
- 팀 리드 승인
- 지정 승인자
- 자기 요청 승인 방지

완료 기준:

- 기존 OWNER/LEAD 승인 정책이 기본값으로 유지된다.

다음 단계 진입 조건:

- 순차 승인 도입 범위 결정.

## 10. 휴가 사용 내역/히스토리 화면

목표:

- 직원과 OWNER가 잔여 변화 이력을 확인한다.

변경 파일 후보:

- `src/app/(app)/leaves/me`
- `src/app/(app)/admin/leaves/balances`
- 신규 ledger detail route

DB migration 필요 여부:

- `LeaveLedger` 도입 후 없음.

위험도:

- 중간.

테스트 항목:

- 직원 자기 장부 조회
- OWNER 전체 조회
- MANAGER 타인 장부 차단

완료 기준:

- 잔여 휴가의 산출 근거를 화면에서 설명할 수 있다.

다음 단계 진입 조건:

- 장부 데이터 정합성 검증 완료.

## 11. 3차 이후 보류 항목

- 캘린더
- 알림
- 외부 연동
- 실제 파일 스토리지
- 연차 촉진
- 퇴직자 정산
- 관리자 통계 대시보드

## 12. 2차 1단계 구현 메모

2차 1단계에서는 휴가 유형 관리 기능을 구현한다.

완료 범위:

- `LeaveTypeDefinition` 기반 휴가 유형 관리
- 시스템 기본 휴가 seed
- OWNER 전용 `/admin/leaves/types`
- 생성/수정/비활성화/재활성화
- 휴가 유형 AuditLog 기록

다음 단계:

- 맞춤휴가 직원 지급 기능
- 지급 이력을 추적하기 위한 `LeaveGrant` 또는 `LeaveLedger` 상세 설계
- 기존 `LeaveRequest.type` enum을 신규 휴가 유형 모델과 연결하는 migration 전략 구체화

## 13. 2차 2단계 구현 메모: 맞춤휴가 직원 지급

2차 2단계에서는 맞춤휴가 유형을 실제 직원에게 지급하고 조회하는 기반을 추가했다.
기존 1차 MVP의 연차/반차/예비군/병가/경조사 요청과 승인 흐름은 유지한다.

구현 범위:

- `LeaveGrant` 기반 맞춤휴가 지급 내역 저장
- OWNER 전용 `/admin/leaves/grants`
- 단일 직원 지급
- 여러 직원 일괄 지급
- 지급 내역 목록 및 상세 조회
- 사용 또는 승인 대기 수량이 없는 지급 내역 회수
- 직원의 `/leaves/me` 화면에서 지급받은 맞춤휴가 확인
- 지급/일괄 지급/회수 AuditLog 기록

운영 원칙:

- 연차 추가 또는 차감은 기존 `LeaveAdjustment`를 사용한다.
- 맞춤휴가 지급은 `LeaveGrant`를 사용한다.
- `ANNUAL` category 휴가 유형은 맞춤휴가 지급 화면에서 지급하지 않는다.
- 이번 단계에서는 맞춤휴가 요청 생성과 승인 연결을 구현하지 않는다.

다음 단계:

- 맞춤휴가를 실제 휴가 요청 생성 화면에 연결한다.
- 지급받은 맞춤휴가의 `usedAmount`, `pendingAmount`, `remainingAmount`를 요청/승인 상태와 연결한다.
- 필요 시 `LeaveLedger` 도입 전환 계획을 확정한다.

## 14. 생일 반차 자동 지급 구현 메모

생일 반차 자동 지급은 2차 맞춤휴가 지급 기반 위에서 구현한다.

구현 항목:

- `BIRTHDAY_HALF_DAY` 휴가 유형 seed
- `BirthdayLeavePolicy`
- `LeaveGrant.source = BIRTHDAY_AUTO`
- `LeaveGrant.referenceYear`, `referenceDate`, `metadata`
- `Notification`
- `pnpm jobs:birthday-half-day-grants`
- OWNER 전용 `/admin/leaves/birthday-policy`
- 직원 전용 `/notifications`

지급일 계산:

- 생일 월/일을 처리 대상 연도에 적용한다.
- 2월 29일은 평년 2월 28일로 처리한다.
- 생일 하루 전을 nominal grant date로 둔다.
- nominal grant date가 토요일, 일요일, enabled CompanyHoliday이면 직전 영업일까지 반복 이동한다.

다음 단계:

- 생일 반차를 맞춤휴가 요청 생성 화면에 연결한다.
- 요청/승인 상태에 따라 `LeaveGrant.pendingAmount`, `usedAmount`, `remainingAmount`를 갱신한다.
- 이메일/외부 알림 연동은 provider 결정 후 별도 단계로 진행한다.
## 2차 4단계: LeaveLedger 휴가 장부

- 목표: 연차, 맞춤휴가, 생일 반차, 수동 조정, 요청/승인/반려/취소 이력을 장부 이벤트로 남긴다.
- 변경 파일 후보: `prisma/schema.prisma`, `src/lib/leave/ledger.ts`, 휴가 요청/승인/지급/조정 action, `scripts/rebuild-leave-ledger.ts`, `scripts/validate-leave-ledger.ts`.
- DB migration 필요 여부: 필요. `LeaveLedger`, `LeaveLedgerEventType`, `LeaveLedgerSource`를 추가한다.
- 위험도: 중간. 기존 `LeaveBalance`와 `LeaveGrant` 저장 수량을 즉시 제거하지 않고 점진 전환한다.
- 테스트 항목: 이벤트별 계산, 요청 상태 변화별 ledger 생성, rebuild idempotency, validate script.
- 완료 기준: 장부 기록이 생성되고 `/admin/leaves/history`와 `/leaves/me`에서 장부 이력을 확인할 수 있다.
- 다음 단계 진입 조건: ledger validate 결과가 0 issue이고 기존 휴가 요청/승인 흐름이 통과한다.
# 최근 진행: 증명자료 제출/첨부파일 검수

- 휴가 유형 관리의 `attachmentPolicy`를 요청 생성과 승인 상세 화면에 연결했다.
- 직원 제출, private local storage, 인증 다운로드 route, OWNER/LEAD 검수, 재제출 요청을 구현했다.
- 다음 단계 후보는 외부 private storage, 바이러스 검사, 승인 전 제출 강제 옵션, 전체 증명자료 관리 화면이다.
