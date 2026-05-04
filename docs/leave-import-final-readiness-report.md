# 휴가 엑셀 업로드 최종 운영 반영 Readiness Report

작성일: 2026-05-04

## 목적

휴가 엑셀 업로드 기능이 production 배포 및 실제 운영 반영에 사용할 수 있는지 최종 점검합니다. 이 보고서는 실제 개인정보 파일을 포함하지 않으며, 운영 DB 접속 정보와 secret 값도 기록하지 않습니다.

## 기능 상태 요약

| 점검 항목 | 상태 | 메모 |
|---|---|---|
| `/admin/leaves/import` 화면 | COMPLETE | OWNER 전용 업로드 화면과 최근 import 이력 표시 |
| 월별 연차 사용 내역 업로드 | COMPLETE | 잔여 연차와 월별 사용량 파싱 |
| 휴가 사용 상세 내역 업로드 | COMPLETE | 상세 row, 상태, 증명자료 상태 파싱 |
| 파일 형식 검증 | COMPLETE | `.xlsx`와 10MB 제한 |
| header row 자동 감지 | COMPLETE | 상세 파일의 안내 row 이후 header 탐색 |
| Excel serial date 변환 | COMPLETE | serial number, 문자열, Date cell 처리 |
| 직원 매칭 | COMPLETE | 사번, 회사내이름, 이름, 이름+조직 기준 |
| 휴가 유형 매핑 | COMPLETE | 기본 raw label 매핑과 미매핑 warning |
| 상태 매핑 | COMPLETE | PENDING, APPROVED, CANCELLED, UNKNOWN |
| 미리보기 | COMPLETE | batch 상세 화면에서 row별 검증 표시 |
| 오류/경고 row 표시 | COMPLETE | row warnings/errors 저장 및 표시 |
| 중복 의심 row 표시 | COMPLETE | 동일 직원/기간/유형/수량 및 ledger idempotency 확인 |
| UNKNOWN row 차단 | COMPLETE | 자동 반영 제외 |
| Step-up 후 최종 반영 | COMPLETE | apply와 reconciliation adjustment에 Step-up 필요 |
| LeaveRequest 생성 | COMPLETE | 상세 APPROVED/PENDING/CANCELLED 상태에 맞게 생성 |
| LeaveLedger 생성 | COMPLETE | APPROVED는 USED, PENDING은 PENDING, CANCELLED는 used 차감 없음 |
| 잔여 연차 조정 | COMPLETE | 월별 잔여 차이는 ADJUSTED 이벤트로 보정 |
| import batch 재반영 차단 | COMPLETE | APPLIED batch와 applied row 재반영 차단 |
| 반영 후 reconciliation | COMPLETE | 엑셀 잔여와 시스템 잔여 비교 |
| 차이 보정 | COMPLETE | OWNER Step-up 후 차이값 보정 |
| AuditLog 기록 | COMPLETE | import, apply, reconciliation, adjustment 기록 |
| OWNER 권한 검증 | COMPLETE | server action과 page에서 OWNER guard 적용 |
| 모바일 UI | COMPLETE | import 목록과 batch 상세은 mobile card 패턴 사용 |

## 지원 파일 구조

### 월별 연차 사용 내역

필수 컬럼:

- 이름
- 사번
- 입사일
- 잔여 연차
- 1월 ~ 12월

### 휴가 사용 상세 내역

필수 컬럼:

- 사번
- 이름
- 회사내이름
- 조직
- 휴가 시작일
- 휴가 종료일
- 항목
- 사용시간(일)
- 사용시간(시간)
- 상태
- 증명자료

## 권한 및 Step-up 검증

- OWNER만 `/admin/leaves/import`에 접근할 수 있습니다.
- OWNER만 파일 업로드, validation, 최종 반영, 차이 보정을 수행할 수 있습니다.
- 최종 반영과 차이 보정은 Step-up 재인증이 필요합니다.
- LEAD, MANAGER, EXTERNAL_PARTNER는 접근 및 반영이 불가해야 합니다.

## 보안 검증

- 엑셀 원본 파일은 public에 저장하지 않습니다.
- 실제 엑셀 원본은 GitHub에 커밋하지 않습니다.
- AuditLog에는 row 원문 전체, token, secret, fileKey, 주민등록번호, 계좌번호를 저장하지 않습니다.
- UNKNOWN 상태 row는 자동 반영하지 않습니다.
- 취소 상태 row는 used로 차감하지 않습니다.
- idempotencyKey와 batch status로 중복 반영을 차단합니다.

## DB migration 필요 여부

필요합니다.

다음 import 관련 migration을 운영 Neon DB에 적용해야 합니다.

- `20260504090000_add_leave_imports`
- `20260504110000_add_leave_import_reconciliation`

운영 DB에는 반드시 다음 명령만 사용합니다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
```

`prisma migrate reset`과 production DB 대상 `prisma migrate dev`는 금지합니다.

## 최종 명령 실행 결과

2026-05-04 로컬 workspace 기준:

| 명령 | 결과 | 메모 |
|---|---|---|
| `corepack pnpm lint` | PASS | ESLint 통과 |
| `corepack pnpm typecheck` | PASS | TypeScript `tsc --noEmit` 통과 |
| `corepack pnpm test` | PASS | 27 files, 181 tests 통과 |
| `corepack pnpm build` | PASS | Next.js production build 통과 |
| `corepack pnpm db:validate` | PASS | Prisma schema valid |
| `corepack pnpm db:generate` | PASS | Prisma Client 생성 |
| `corepack pnpm prisma migrate status` | FAIL | 로컬 `.env`의 `localhost:5432/internal_ops_mvp` 연결 기준 Schema engine error. 운영 DB에서는 Neon `DATABASE_URL`로 `prisma migrate deploy`를 실행해야 함 |

## Git 금지 파일 점검

`git status --short` 기준 실제 `.env`, `private/`, `.xlsx`, `.xls` 파일은 추적 대상에 포함되지 않았습니다.

로컬 workspace에는 다음 파일이 존재하지만 `.gitignore` 대상입니다.

- `.env`
- `private/imports/employee-master-fixture.xlsx`

`.env.example`, `.env.production.example`은 secret 값이 없는 예시 파일로만 관리합니다.

## P0 blocker

현재 코드 기준으로 확인된 P0 blocker는 없습니다.

단, 이 판단은 로컬 품질 명령과 코드 검수 기준입니다. 실제 production 배포 후에는 운영 URL에서 OWNER 계정과 실제 preview-only 업로드로 smoke test를 수행해야 합니다.

## P1 개선 항목

- 실제 운영 파일 첫 반영은 전체 직원 대상 일괄 반영보다 소수 row preview와 부분 반영으로 시작하는 것을 권장합니다.
- 모바일에서 row 수가 매우 큰 batch는 필터 사용성을 추가로 관찰해야 합니다.
- 자동 rollback은 제공하지 않으며, 잘못 반영한 경우 반대 조정 이벤트로 대응해야 합니다.

## P2 후속 항목

- batch 단위 soft reverse 자동화
- 대용량 import background job 분리
- 운영자용 mapping preset 관리 화면
- import 결과 다운로드 리포트

## 최종 판단

제한적으로 실제 운영 반영 가능.

조건:

1. 운영 Neon DB에 migration을 `prisma migrate deploy`로 적용합니다.
2. production env를 확인합니다.
3. 실제 엑셀 원본은 운영 화면에서만 업로드합니다.
4. 먼저 상세 파일을 preview-only로 확인하고, 문제가 없을 때 소수 row부터 반영합니다.
5. 상세 파일 반영 후 월별 파일로 잔여 연차를 비교하고 차이 직원만 보정합니다.
