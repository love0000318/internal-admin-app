# 휴가 Import 실제 운영 반영 Readiness Report

## 목적

휴가 엑셀 업로드 기능을 실제 운영 데이터에 반영할 수 있는지 배포 전 관점에서 판단합니다.

## 기능 상태

| 항목 | 상태 | 비고 |
|---|---|---|
| Vercel production 상태 | UNKNOWN | 작업 환경에서 production fetch 검증 불가, 운영자가 Vercel 대시보드와 `/api/health`로 확인 필요 |
| Neon DB migration 상태 | UNKNOWN | 운영 `DATABASE_URL`로 `prisma migrate deploy/status` 확인 필요 |
| OWNER 로그인 | UNKNOWN | 운영 OWNER 계정으로 직접 확인 필요 |
| `/admin/leaves/import` 화면 | COMPLETE | OWNER 전용 업로드 화면 |
| 월별 연차 사용 내역 파싱 | COMPLETE | header, 입사일, 잔여 연차, 월별 사용량 |
| 휴가 사용 상세 내역 파싱 | COMPLETE | header 자동 탐색, 날짜 변환 |
| import 미리보기 | COMPLETE | summary, row validation, 모바일 카드 |
| 직원 매칭 | COMPLETE | 사번, 이름, 회사내이름, 조직 기준 |
| 휴가 유형 매핑 | COMPLETE | 기본 매핑 제공, 누락 시 오류 |
| 상태 매핑 | COMPLETE | UNKNOWN 보수 처리 |
| validation | COMPLETE | 미매칭, UNKNOWN, 오류 row 차단 |
| 중복 방지 | COMPLETE | row applied, batch status, ledger idempotency |
| Step-up 최종 반영 | COMPLETE | apply 시 `POLICY_CHANGE` Step-up 필요 |
| AuditLog | COMPLETE | import upload/parse/validate/apply 기록 |
| 반영 후 reconciliation | COMPLETE | 월별 잔여 비교 및 생성 수 요약 |
| 자동 rollback | NOT_STARTED | 현재는 수동 보정 절차 사용 |

## 월별 파일 반영 가능 여부

판정: 운영 반영 가능

조건:

- 상세 사용 내역을 먼저 반영한 뒤 월별 잔여 파일을 업로드합니다.
- 엑셀 잔여와 시스템 잔여 차이를 확인합니다.
- 차이가 있는 직원만 조정합니다.
- 반영 후 직원별 reconciliation을 확인합니다.

## 상세 파일 반영 가능 여부

판정: 제한적으로 운영 반영 가능

조건:

- UNKNOWN 상태 row가 없어야 합니다.
- 미매칭 row가 없어야 합니다.
- 중복 의심 row를 운영자가 확인해야 합니다.
- 취소 row가 사용량으로 차감되지 않는지 확인해야 합니다.
- 첫 실제 반영은 소수 직원 또는 preview-only 리허설 후 진행합니다.

## Step-up 적용 여부

최종 apply는 서버에서 Step-up 재인증을 요구합니다. Step-up 없이 반영 버튼을 실행하면 실패해야 합니다.

## 중복 방지 상태

- 같은 batch는 재반영할 수 없습니다.
- 같은 row는 재반영할 수 없습니다.
- 같은 idempotencyKey의 LeaveLedger가 있으면 차단됩니다.
- 동일 직원, 동일 기간, 동일 휴가 유형, 동일 사용일수의 기존 휴가 요청은 중복 의심으로 표시됩니다.

## 정합성 검증 상태

반영 후 batch 상세에서 다음을 확인할 수 있습니다.

- 반영 완료 row 수
- 생성 또는 연결된 LeaveRequest 수
- 생성된 LeaveLedger 수
- 생성된 LeaveAdjustment 수
- 건너뛴 row와 실패 row 수
- 직원별 엑셀 잔여와 시스템 잔여 차이

## 남은 P0 Blocker

없음.

## 남은 P1 개선 항목

- 실제 운영 파일 preview-only 리허설 필요
- 운영 OWNER 계정으로 로그인, Step-up, `/admin/leaves/import` 접근 직접 확인 필요
- Vercel production 배포 상태와 Neon migration 상태 직접 확인 필요
- row 수가 많은 batch의 검색과 필터 UX 개선
- 운영 Neon DB migration status 확인 필요
- 자동 rollback 미지원으로 수동 보정 절차 숙지 필요

## 이번 작업 환경에서 실행한 검증

- `corepack pnpm lint`: 통과
- `corepack pnpm typecheck`: 통과
- `corepack pnpm test`: 통과
- `corepack pnpm build`: 통과
- `corepack pnpm db:validate`: 통과
- `corepack pnpm db:generate`: 통과

production 인증 흐름, 운영 Neon migration 상태, 실제 엑셀 파일 preview는 운영 계정과 운영 환경 접근이 필요해 이 문서에서는 직접 완료로 표시하지 않습니다.

## 남은 P2 후속 항목

- import batch 자동 reverse
- 대용량 파일 비동기 처리
- 매핑 preset 관리 UI
- 샘플 템플릿 다운로드

## 운영 반영 가능 여부

최종 판단: 제한적으로 운영 반영 가능

제한 조건:

1. 운영 DB migration을 `prisma migrate deploy`로 적용합니다.
2. 실제 파일은 먼저 preview-only로 업로드해 미매칭, UNKNOWN, 중복 의심 row를 제거합니다.
3. 상세 파일을 먼저 반영하고 월별 파일은 나중에 조정합니다.
4. 첫 반영은 소수 직원 범위로 시작합니다.
5. 반영 후 `docs/leave-import-post-apply-verification.md` 템플릿으로 정합성 검증을 남깁니다.
