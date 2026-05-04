# 구성원 휴가 현황 조회 및 엑셀 업로드 통합 QA 보고서

작성일: 2026-05-04

## 검수 목적

구성원 휴가 현황 조회 권한, LeaveLedger 기반 잔여 계산, 휴가 현황 엑셀 업로드, 템플릿 다운로드, 업로드 이력/상세, Step-up 후 최종 반영, 반영 취소/역조정 흐름이 배포 가능한 상태인지 확인한다.

## 검수 범위

- `/admin/leaves/balances`
- `/admin/leaves/balances/[userId]`
- `/leaves/me`
- `/admin/leaves/import`
- `/admin/leaves/import/[batchId]`
- `/admin/leaves/import/template`
- `src/lib/leave/balance-scope.ts`
- `src/lib/leave/import.ts`
- `src/lib/leave/ledger.ts`
- AuditLog, Step-up, Prisma migration

## 기능 상태 진단

| 항목 | 상태 | 근거 |
|---|---|---|
| 구성원 휴가 현황 목록 | COMPLETE | `/admin/leaves/balances` 존재, 서버 scope 기반 조회 |
| 구성원 휴가 현황 상세 | COMPLETE | `/admin/leaves/balances/[userId]` 존재, 직원별 상세 표시 |
| OWNER 전체 조회 | COMPLETE | `getLeaveBalanceScope`에서 전체 ACTIVE 내부 직원 조회 |
| LEAD 담당 조직 조회 | COMPLETE | `getReviewableTeamIdsForLead` 기반 팀/하위 팀 scope |
| MANAGER 접근 차단 | COMPLETE | 목록 접근 차단, 본인 상세은 `/leaves/me`로 이동 |
| EXTERNAL_PARTNER 접근 차단 | COMPLETE | scope NONE 및 route guard로 차단 |
| LeaveLedger 잔여 계산 재사용 | COMPLETE | `getUserLeaveBalance`, `getUserLedgerBalance` 재사용 |
| 맞춤휴가/생일 반차 잔여 표시 | COMPLETE | active LeaveGrant 집계 표시 |
| 휴가 현황 엑셀 업로드 | COMPLETE | `/admin/leaves/import` 업로드 action |
| 엑셀 템플릿 다운로드 | COMPLETE | `/admin/leaves/import/template` route |
| 업로드 미리보기 | COMPLETE | batch 상세에서 row 검증과 reconciliation 표시 |
| 업로드 검증 | COMPLETE | 미매칭, UNKNOWN, 중복, idempotency 검증 |
| 업로드 반영 | COMPLETE | Step-up 후 `LeaveAdjustment`/`LeaveLedger` 생성 |
| 업로드 이력 | COMPLETE | import 메인 화면에서 최근 batch 목록 표시 |
| 업로드 상세 | COMPLETE | batch별 row, 결과, reconciliation 표시 |
| 반영 취소/역조정 | COMPLETE | APPLIED 월별 batch reverse adjustment 지원 |
| Step-up 재인증 | COMPLETE | 반영, 보정, 반영 취소에 `POLICY_CHANGE` Step-up 필요 |
| AuditLog | COMPLETE | 업로드, 조회, 반영, reverse, 차단 기록 |
| 모바일 UI | PARTIAL | ResponsiveTable/MobileCardList 적용. 실제 실기기 수동 검수는 배포 후 필요 |
| 문서화 | COMPLETE | 가이드, smoke test, 권한표, 운영 문서 보완 |
| 테스트 | COMPLETE | Vitest 192개 통과 |

## 권한 검수 결과

### OWNER

- 전체 구성원 휴가 현황 목록 접근 가능
- 전체 scope userIds로 조회
- 구성원 휴가 상세 접근 가능
- 엑셀 템플릿 다운로드 가능
- 엑셀 업로드/미리보기/이력/상세 접근 가능
- Step-up 후 업로드 반영 가능
- Step-up 후 APPLIED 월별 batch 반영 취소 가능

### LEAD

- 담당 팀과 하위 팀 구성원만 조회 가능
- 팀 필터는 `scope.teamIds` 내부 값만 허용
- 담당 범위 밖 userId 직접 접근 시 `/forbidden`
- 엑셀 업로드, 템플릿 다운로드, 업로드 이력, 반영 취소 접근 불가
- 민감 HR 정보는 휴가 현황 화면에 표시하지 않음

### MANAGER

- `/leaves/me` 본인 휴가 현황 접근 가능
- 구성원 휴가 현황 목록 접근 차단
- 본인 상세 URL은 `/leaves/me`로 이동, 타인 상세는 차단
- 엑셀 업로드/템플릿/이력 접근 불가

### EXTERNAL_PARTNER

- 내부 휴가 현황과 import 기능 접근 불가
- scope NONE

## 휴가 현황 계산 검수 결과

- 목록/상세 화면은 기존 `getUserLeaveBalance`를 사용한다.
- 템플릿 다운로드는 `getUserLedgerBalance`로 현재 기준 참고값을 채운다.
- 업로드 반영은 기존 휴가 이력을 덮어쓰지 않고 잔여 차이만 `LeaveAdjustment`와 `LeaveLedger ADJUSTED`로 기록한다.
- OWNER/LEAD/직원 본인 화면의 source of truth는 기존 LeaveLedger/leave balance helper다.

## 템플릿 다운로드 검수 결과

경로: `/admin/leaves/import/template`

검수 결과:

- 파일명: `leave-balance-import-template.xlsx`
- ACTIVE 내부 직원만 포함
- EXTERNAL_PARTNER 제외
- DELETED/DEACTIVATED 직원 기본 제외
- 컬럼: 직원명, 이메일, 사번, 팀, 기준연도, 총 부여 연차, 사용 연차, 승인대기 연차, 잔여 연차, 조정 메모
- `업로드 안내` 도움말 시트 포함
- 주민등록번호, 계좌번호, 주소, 급여정보, 가족정보, token/hash/secret 포함 없음
- OWNER 외 접근은 `requireOwner()`로 차단

## 업로드 미리보기 검수 결과

- 정상 row는 직원 매칭, 기준연도, 잔여 수량, 조정 예정값을 표시한다.
- 경고 row는 사용/잔여/부여 불일치, 중복 가능성 등을 표시한다.
- 오류 row는 직원 매칭 실패, 동명이인, 숫자 오류, 음수 잔여, 0.5 단위 위반, 중복 직원+연도 등을 표시하고 반영 대상에서 제외한다.
- UNKNOWN 상태와 미매칭 row는 자동 반영하지 않는다.

## 업로드 반영 검수 결과

- OWNER만 가능
- Step-up 없으면 실패
- ERROR/차단 row가 있으면 batch 반영 실패
- 차이값이 0인 row는 불필요한 adjustment를 만들지 않음
- 차이가 있는 row만 `LeaveAdjustment`와 `LeaveLedger ADJUSTED` 생성
- batch status는 APPLIED로 변경
- batch 재반영은 차단
- AuditLog에 요약만 기록

## 반영 취소/역조정 검수 결과

- APPLIED 상태의 `MONTHLY_ANNUAL_USAGE` batch만 취소 가능
- Step-up 없으면 실패
- 기존 LeaveAdjustment/LeaveLedger/LeaveRequest 삭제 없음
- 원래 import ledger의 signedAmount 반대값으로 reverse adjustment 생성
- reverse source: `IMPORT_REVERSE_ADJUSTMENT`
- batch status는 REVERSED로 변경
- reversedAt, reversedByUserId, reverseReason 저장
- 이미 REVERSED batch 재취소 차단
- AuditLog에 reverse 요청/완료/차단 기록

## 모바일 UI 검수 결과

코드 기준 확인:

- 구성원 휴가 현황 목록: `MobileCardList` + `ResponsiveTable`
- 구성원 휴가 상세: card/table 반응형 구성
- 업로드 이력: desktop table + mobile card
- 업로드 상세: summary card, row mobile card, responsive table
- 필터/폼: 모바일 1열 grid와 `w-full`, `min-w-0` 사용

실제 360px/390px/430px 실기기 또는 브라우저 viewport 검수는 배포 후 smoke test에서 수행해야 한다.

## 보안 검수 결과

- 업로드 원본 파일은 public에 저장하지 않고 서버에서 파싱한다.
- `.gitignore`에 `private/`, `*.xlsx`, `*.xls`, `.env*` 보호 규칙이 있다.
- 템플릿에는 민감 HR 정보가 없다.
- AuditLog metadata는 batch id, row count, 상태, 요약 수량 중심이다.
- token/hash/secret/fileKey/주민등록번호/계좌번호 저장 경로 없음.
- Step-up 없이 반영/보정/취소 불가.
- OWNER 외 import route/action 접근 차단.

## 실행한 명령과 결과

| 명령 | 결과 |
|---|---|
| `corepack pnpm db:generate` | 통과 |
| `corepack pnpm db:validate` | 통과 |
| `corepack pnpm typecheck` | 통과 |
| `corepack pnpm test` | 통과, 28 files / 192 tests |
| `corepack pnpm lint` | 통과 |
| `corepack pnpm build` | 통과 |
| `corepack pnpm prisma migrate status` | 실패, 현재 로컬 `localhost:5432` DB/schema engine 연결 문제 |

## 남은 P0/P1/P2

### P0

없음.

### P1

- 운영 Neon DB에서 migration deploy 필요.
- 배포 후 실제 OWNER 계정으로 템플릿 다운로드와 reverse smoke test 필요.
- 모바일 실기기 또는 브라우저 viewport 최종 검수 필요.

### P2

- 휴가 사용 상세 import로 생성된 LeaveRequest 자동 reverse 정책.
- LEAD export 정책.
- 비활성 직원 포함 템플릿 옵션.

## Migration 필요 여부

필요.

추가 migration:

- `20260504130000_leave_import_reverse`

운영 DB 적용 명령:

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
```

운영 DB에서 `prisma migrate reset`은 절대 사용하지 않는다.

## 배포 가능 여부

제한적으로 배포 가능.

제한 조건:

- 운영 Neon DB에 pending migration을 `migrate deploy`로 적용해야 한다.
- 배포 후 OWNER 계정으로 import template/download/apply/reverse smoke test를 완료해야 한다.

위 조건을 충족하면 직원 휴가 현황 조회와 엑셀 업로드 운영 기능은 배포 가능하다.
