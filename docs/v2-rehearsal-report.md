# 2차 고도화 통합 QA 리허설 보고서

작성일: 2026-05-02

## 리허설 목적

2차 HR·휴가 고도화 기능이 1차 MVP를 깨뜨리지 않고 실제 운영 흐름으로 이어질 수 있는지 확인한다. 이번 리허설은 새 대형 기능 구현이 아니라 자동 테스트, 빌드, preflight, 주요 job dry-run, 문서 기반 수동 시나리오 정리를 중심으로 수행했다.

## 리허설 범위

- 1차 MVP 기본 기능
- 인증, 세션, token 보안
- HR import, 사전 프로필, 온보딩, 직원 프로필
- 휴가 유형, 맞춤휴가, 생일 반차, 맞춤휴가 요청
- LeaveLedger, 연차 정책, 연차 촉진, 사용계획, 소멸
- 증명자료 제출/검수
- 휴가 승인 정책
- 휴가 캘린더와 공개 범위
- 관리자 리포트와 CSV export
- 알림센터, JobRun, batch job
- 보안·개인정보·권한
- 문서와 smoke test

## 기능군 상태 진단

| 기능군 | 상태 | 근거 / 비고 |
| --- | --- | --- |
| 1차 MVP 기본 기능 | COMPLETE | lint/typecheck/test/build/preflight 통과, 기존 route 유지 |
| 인증/세션/token | COMPLETE | session/invitation token hash 구조와 보안 테스트 존재 |
| OWNER/LEAD/MANAGER/EXTERNAL_PARTNER 권한 | COMPLETE | RBAC 테스트와 protected route/action 구조 존재 |
| 조직/팀 관리 | COMPLETE | 조직 테스트와 OWNER route 존재 |
| 직원 초대/가입 | COMPLETE | invitation accept route, seed, tokenHash 보안 유지 |
| HR 엑셀 import | PARTIAL | `hr:import` script 존재, 실제 엑셀 fixture 실행은 이번 환경에서 미수행 |
| 사전 직원 프로필 | PARTIAL | EmployeePrejoinProfile 모델은 있으나 전용 `/admin/hr/prejoin-profiles` route와 reviewStatus 필드는 없음 |
| 사전 프로필 기반 초대/일괄 초대 | PARTIAL | 이메일 기준 연결 구조는 있으나 전용 일괄 초대 운영 화면은 없음. 브라우저 실사용 리허설 필요 |
| 직원 온보딩 | PARTIAL | `/profile/confirm`과 HR 리포트는 있으나 별도 prejoin onboardingStatus 필드는 없음 |
| 직원 프로필 자동 생성 | COMPLETE | 초대 수락 흐름과 HR profile 테스트 존재 |
| 직원 자기 정보 수정 | COMPLETE | allowlist server action과 테스트 존재 |
| 민감정보 변경 요청 | COMPLETE | 변경 요청 모델/action, 암호화 helper, Notification/AuditLog 존재 |
| 휴가 유형 관리 | COMPLETE | route/action/test 존재 |
| 맞춤휴가 지급 | COMPLETE | LeaveGrant action/test, ledger 연결 존재 |
| 생일 반차 자동 지급 | COMPLETE | script dry-run 통과, 테스트 존재 |
| 맞춤휴가 요청 연결 | COMPLETE | custom leave request 테스트 존재 |
| LeaveLedger | COMPLETE | validate 통과, ledger 테스트 존재 |
| 연차 정책 | COMPLETE | AnnualLeavePolicy seed/page/test 존재 |
| 연차 촉진 | COMPLETE | schedule script dry-run 통과, 테스트 존재 |
| 연차 사용계획 제출 | COMPLETE | `/leaves/me/use-plan` route/action/test 존재 |
| 연차 소멸 | COMPLETE | expire dry-run 통과, EXPIRED ledger 구조 존재 |
| 증명자료 제출/검수 | COMPLETE | attachment model/route/action/test 존재 |
| 휴가 승인 정책 | COMPLETE | ApprovalPolicy route/action/test 존재 |
| 휴가 캘린더 | COMPLETE | calendar route/helper/test 존재 |
| 관리자 리포트 | COMPLETE | report routes/export/helper/test 존재 |
| CSV export 보안 | COMPLETE | allowlist, BOM, injection 방어, REPORT_EXPORTED 테스트 존재 |
| 알림센터 | COMPLETE | `/notifications`, read 처리, 테스트 존재 |
| JobRun/배치 Job | COMPLETE | JobRun 모델, `/admin/jobs`, dry-run 통과 |
| Cron endpoint 보안 | PARTIAL | `assertCronRequestAuthorized` 테스트는 존재하지만 현재 `/api/cron/*` route는 없음. 운영은 CLI Job 중심이며 endpoint 도입은 TODO |
| AuditLog | COMPLETE | 주요 action enum, redaction/sanitize 보강 |
| Notification | COMPLETE | 공통 helper, metadata sanitize 보강 |
| preflight | COMPLETE | 보안 env/table/storage 점검 통과 |
| 보안/개인정보/권한 | COMPLETE | 보안 helper/test/doc 보강 완료 |
| 테스트/빌드 | COMPLETE | 22 test files / 126 tests 통과, build 통과 |
| 문서화 | COMPLETE | smoke-test.md 재작성, 보안/Job/리포트/휴가 문서 존재 |

## 실행한 명령

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm lint` | PASS |
| `corepack pnpm typecheck` | PASS |
| `corepack pnpm test` | PASS, 22 files / 126 tests |
| `corepack pnpm build` | PASS |
| `corepack pnpm db:validate` | PASS |
| `corepack pnpm db:generate` | PASS |
| `corepack pnpm db:seed` | PASS, 기존 OWNER invitation 재출력 없음 |
| `corepack pnpm db:status` | PASS, 14 migrations, DB up to date |
| `corepack pnpm preflight` | PASS with WARN |
| `corepack pnpm leave:ledger:validate` | PASS, issues 0 |
| `corepack pnpm jobs:birthday-half-day-grants -- --dry-run` | PASS, granted 0 / skipped 1 |
| `corepack pnpm jobs:schedule-annual-promotion-notices -- --dry-run` | PASS, candidates 0 |
| `corepack pnpm jobs:expire-annual-leaves -- --dry-run` | PASS, checked 0 / expired 0 |

## Preflight WARN

- `CRON_SECRET`이 로컬 `.env`에 없다. 현재는 `/api/cron/*` route가 없고 CLI Job 중심 운영이므로 blocker는 아니지만, cron endpoint를 추가할 때는 반드시 설정해야 한다.
- `MAX_LEAVE_ATTACHMENT_SIZE_MB`가 로컬 `.env`에 없다. 기본값 또는 운영 env 설정 필요.
- `private/uploads`가 아직 생성되어 있지 않다. 실제 첨부 업로드 전 디렉터리를 생성하거나 storage 설정을 확인해야 한다.

## 통과한 시나리오

- 시나리오 A: 기본 MVP 흐름은 자동 테스트와 빌드/preflight 기준 통과. OWNER 초대/가입 실브라우저 재리허설은 최종 인수에서 수행 필요.
- 시나리오 B: HR import/온보딩 구조 확인. 실제 엑셀 fixture 실행은 미수행.
- 시나리오 C: 직원 자기 정보 수정과 민감정보 변경 요청은 테스트와 action 검수 기준 통과.
- 시나리오 D: 휴가 유형과 맞춤휴가 지급은 테스트 기준 통과.
- 시나리오 E: 생일 반차 dry-run 및 테스트 기준 통과.
- 시나리오 F: 맞춤휴가 요청 연결은 테스트 기준 통과.
- 시나리오 G: LeaveLedger validate 통과.
- 시나리오 H: 연차 정책/촉진/소멸 dry-run 통과.
- 시나리오 I: 증명자료 제출/다운로드 권한은 테스트와 route 검수 기준 통과.
- 시나리오 J: 승인 정책은 테스트 기준 통과.
- 시나리오 K: 캘린더 공개 범위는 테스트 기준 통과.
- 시나리오 L: 관리자 리포트/CSV 보안은 테스트 기준 통과.
- 시나리오 M: 알림센터/JobRun은 테스트와 dry-run 기준 통과.
- 시나리오 N: 보안/개인정보/권한은 보안 테스트 기준 통과.

## 실패한 시나리오

자동 명령 기준으로 실패한 시나리오는 없다.

수동 브라우저 리허설은 이번 실행에서 수행하지 않았다. 최종 인수 단계에서 실제 OWNER/MANAGER/LEAD 계정으로 대표 플로우를 클릭 검수해야 한다.

## 수정한 문제

- 기존 `docs/smoke-test.md`가 인코딩 문제로 patch 적용이 어려운 상태였으므로 2차 기준 UTF-8 체크리스트로 재작성했다.
- 2차 리허설 커버리지 테스트를 추가해 주요 script, route, smoke 문서 섹션 누락을 자동 감지하도록 했다.

## 보강한 테스트

- `tests/v2-rehearsal-coverage.test.ts`
  - 주요 2차 운영 script wiring 확인
  - 핵심 protected route 존재 확인
  - 2차 smoke 문서 필수 섹션 확인

## 보안 점검 결과

- 민감정보 암호화 helper와 마스킹 helper가 존재한다.
- AuditLog 표시와 주요 신규 metadata 경로는 sanitize/redaction을 거친다.
- Notification 공통 helper는 metadata sanitize를 적용한다.
- JobRun summary/error는 sanitize를 적용한다.
- CSV export는 allowlist 기반이며 injection 방어가 있다.
- 첨부파일 다운로드 route는 서버 권한 검증 후 private storage에서 읽는다.
- session/invitation token 원문 저장 금지 원칙이 유지된다.

## 권한 점검 결과

- OWNER 전용 admin route가 유지된다.
- MANAGER는 admin reports/jobs 접근 불가 테스트가 있다.
- LEAD 담당 범위, 자기 승인 방지, 캘린더 공개 범위 테스트가 있다.
- 알림은 자기 알림만 조회/읽음 처리하는 구조다.

## 남은 문제

Blocker는 없다.

운영 전 확인이 필요한 항목:

- 실제 HR 엑셀 fixture로 `hr:import`를 한 번 실행하고 import 결과를 확인한다.
- 실제 브라우저에서 OWNER 가입부터 직원 가입, 휴가 요청/승인까지 end-to-end로 클릭 검수한다.
- 운영 `.env`에 `CRON_SECRET`, `MAX_LEAVE_ATTACHMENT_SIZE_MB`, `PRIVATE_UPLOAD_DIR`를 확정한다.
- 실제 첨부파일 업로드 전 `private/uploads` 디렉터리 또는 외부 storage 정책을 준비한다.

## 실제 사용 가능 여부

최종 판단: **2차 고도화 제한적으로 사용 가능**

판단 이유:

- 자동 테스트, 빌드, Prisma, seed, preflight, LeaveLedger validate, 주요 job dry-run은 통과했다.
- 코드 구조와 권한/보안 테스트 기준으로 blocker는 없다.
- 다만 실제 브라우저 기반 전체 업무 리허설과 HR 엑셀 fixture import는 이번 실행에서 수행하지 않았으므로, 운영 투입 전 최종 인수 단계에서 실사용 클릭 검수가 필요하다.

## 2차 최종 인수 단계로 넘어가기 위한 조건

- 실제 브라우저에서 대표 시나리오 A, B, I, L, N을 최소 1회 수행한다.
- 운영 env secret과 private upload dir을 확정한다.
- HR 엑셀 fixture 또는 실제 샘플 파일 import를 private 경로에서 검증한다.
- 최종 인수 보고서에 수동 리허설 결과와 운영 전 제한사항을 반영한다.
