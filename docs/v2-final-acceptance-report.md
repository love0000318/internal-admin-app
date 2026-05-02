# 2차 고도화 최종 인수 보고서

작성일: 2026-05-02

## 2차 고도화 완료 요약

1차 MVP의 인증, 조직/직원, 휴가 요청/승인, 감사 로그 흐름을 유지한 상태에서 HR import, 직원 온보딩, 휴가 유형 관리, 맞춤휴가, 생일 반차, LeaveLedger, 연차 정책/촉진/소멸, 증명자료, 승인 정책, 캘린더, 관리자 리포트, 알림센터, JobRun, 보안·개인정보 보호를 단계적으로 확장했다.

이번 최종 인수 작업에서는 새 대형 기능을 추가하지 않고, 자동 테스트와 빌드, DB 검증, preflight, 주요 job dry-run, 문서 기반 smoke 시나리오를 기준으로 실제 운영 가능 여부를 판단했다.

## 기능별 상태 진단표

| 기능군 | 상태 | 최종 판단 |
| --- | --- | --- |
| 1차 MVP 기본 기능 | COMPLETE | 기존 route와 테스트, build/preflight 기준 유지 |
| 인증/세션/token | COMPLETE | token 원문 저장 금지, session hash, cookie 보안 원칙 유지 |
| OWNER/LEAD/MANAGER/EXTERNAL_PARTNER 권한 | COMPLETE | RBAC 테스트와 protected route/action 유지 |
| 조직/팀 관리 | COMPLETE | 조직 route/test 유지 |
| 직원 초대/가입 | COMPLETE | invitation tokenHash와 seed idempotency 확인 |
| HR 엑셀 import | PARTIAL | script 존재, 실제 엑셀 fixture import는 운영 전 수동 검수 필요 |
| 사전 직원 프로필 | PARTIAL | `EmployeePrejoinProfile` 모델은 있으나 전용 `/admin/hr/prejoin-profiles` 목록/상세/검수 route와 reviewStatus 필드는 없음 |
| 사전 프로필 기반 초대/일괄 초대 | PARTIAL | 이메일 기준 연결 구조는 있으나 전용 일괄 초대 운영 화면은 없음. 실제 브라우저 리허설 필요 |
| 직원 온보딩 | PARTIAL | `/profile/confirm`과 HR 리포트는 있으나 별도 prejoin onboardingStatus 필드는 없음 |
| 직원 프로필 자동 생성 | COMPLETE | 초대 가입 흐름과 HR profile 구조 존재 |
| 직원 자기 정보 수정 | COMPLETE | allowlist 기반 server action 유지 |
| 민감정보 변경 요청 | COMPLETE | 변경 요청, OWNER 승인/반려, 암호화 저장 구조 존재 |
| 휴가 유형 관리 | COMPLETE | OWNER 전용 관리와 시스템 기본 휴가 보호 테스트 존재 |
| 맞춤휴가 지급 | COMPLETE | LeaveGrant 지급/회수/조회 구조 존재 |
| 생일 반차 자동 지급 | COMPLETE | dry-run 통과, 중복 지급 방지 구조 존재 |
| 맞춤휴가 요청 연결 | COMPLETE | 잔여/기간/단위 검증 테스트 존재 |
| LeaveLedger | COMPLETE | validate issues 0 |
| 연차 정책 | COMPLETE | AnnualLeavePolicy seed/page/test 존재 |
| 연차 촉진 | COMPLETE | schedule dry-run 통과 |
| 연차 사용계획 제출 | COMPLETE | use-plan route/action/test 존재 |
| 연차 소멸 | COMPLETE | expire dry-run 통과, EXPIRED ledger 구조 존재 |
| 증명자료 제출/검수 | COMPLETE | private storage, 다운로드 권한, 상태 전환 테스트 존재 |
| 휴가 승인 정책 | COMPLETE | ApprovalPolicy와 정책별 승인 테스트 존재 |
| 휴가 캘린더 | COMPLETE | 공개 범위와 역할별 표시 테스트 존재 |
| 관리자 리포트 | COMPLETE | 8개 리포트 route와 export helper 존재 |
| CSV export 보안 | COMPLETE | allowlist, UTF-8 BOM, injection 방어, REPORT_EXPORTED AuditLog |
| 알림센터 | COMPLETE | 자기 알림 조회, 읽음 처리 구조 존재 |
| JobRun/배치 Job | COMPLETE | JobRun table, admin jobs, dry-run 기록 존재 |
| Cron endpoint 보안 | PARTIAL | `CRON_SECRET` 검증 helper와 테스트는 존재하지만 현재 `/api/cron/*` route는 없음. 운영은 CLI Job 중심이며 endpoint 도입은 TODO |
| AuditLog | COMPLETE | 주요 action과 redaction/sanitize 적용 |
| Notification | COMPLETE | metadata sanitize 적용 |
| preflight | COMPLETE | env, secret, seed, table, storage 점검 |
| 보안/개인정보/권한 | COMPLETE | 보안 helper/test/doc 보강 완료 |
| 테스트/빌드 | COMPLETE | 22 test files / 126 tests 통과 |
| 문서화 | COMPLETE | smoke, rehearsal, 보안, 운영 시작 문서 정리 |

## 1차 MVP 호환성 결과

- 로그인/로그아웃, 세션, OWNER 접근 route가 유지된다.
- 조직/팀/직원/초대 route가 유지된다.
- 연차/반차/기본 휴가 요청과 OWNER/LEAD 승인 route가 유지된다.
- 직원별 휴가 보유 현황과 감사 로그 route가 build output에 포함된다.
- `lint`, `typecheck`, `test`, `build`, `preflight`가 모두 통과했다.

## HR 기능 검수 결과

- `hr:import` script가 package.json에 연결되어 있다.
- EmployeeImportBatch, EmployeePrejoinProfile, EmployeeProfile 계열 모델이 존재한다.
- 전용 prejoin 검수 route와 prejoin review/onboarding status 필드는 현재 없으므로 운영은 import script, 초대 화면, HR 리포트, profile confirm 중심으로 수행한다.
- 직원 자기 정보 수정과 민감정보 변경 요청 테스트가 존재한다.
- 민감정보 암호화 helper와 마스킹 helper가 존재한다.
- 실제 엑셀 fixture import와 브라우저 기반 사전 프로필 초대 리허설은 운영 전 수행해야 한다.

## 휴가 고도화 검수 결과

- 휴가 유형 관리, 맞춤휴가 지급, 맞춤휴가 요청, 생일 반차 지급, 승인 정책, 증명자료, 캘린더, 리포트 route가 build output에 포함된다.
- 관련 테스트가 모두 통과했다.
- 시스템 기본 휴가 보호와 OWNER 전용 관리 원칙이 유지된다.

## 맞춤휴가 검수 결과

- LeaveGrant 지급/회수/요청 테스트가 존재한다.
- 맞춤휴가 요청 시 잔여, 기간, 단위, 증명자료 정책 검증이 구현되어 있다.
- 승인/반려/철회/취소 시 수량 정합성은 테스트와 ledger validate 기준으로 통과했다.

## 생일 반차 검수 결과

- `jobs:birthday-half-day-grants -- --dry-run` 통과.
- 실행 결과: `grantedCount=0`, `skippedCount=1`, `processedDate=2026-05-02`.
- 지급 대상 데이터가 적은 로컬 DB 기준이며, 실제 운영 전 직원 생일 데이터로 재검수 필요.

## LeaveLedger 검수 결과

- `leave:ledger:validate` 통과.
- 결과: checked users 2, checked grants 0, issues found 0.
- rebuild script와 validate script가 package.json에 연결되어 있다.

## 연차 정책/촉진/소멸 검수 결과

- AnnualLeavePolicy seed가 존재한다.
- 회계일 1월 1일, 반차 단위, 당겨쓰기 미허용 기본 정책이 문서화되어 있다.
- `jobs:schedule-annual-promotion-notices -- --dry-run` 통과: candidates 0.
- `jobs:expire-annual-leaves -- --dry-run` 통과: checked 0, expired 0.
- 법무/노무 최종 판단이 아니라 운영 보조 기능이라는 안내가 문서화되어 있다.

## 증명자료 검수 결과

- LeaveAttachment 모델, 상태, private storage adapter, 다운로드 route가 존재한다.
- 다운로드 route는 서버에서 권한 검증 후 private storage에서 읽는다.
- fileKey/private path는 CSV와 AuditLog에 노출하지 않는 원칙이 적용되어 있다.
- 실제 파일 업로드/다운로드 브라우저 검수는 운영 전 수행 필요.

## 승인 정책 검수 결과

- ApprovalPolicy 모델과 OWNER 전용 관리 route가 존재한다.
- 자동 승인, OWNER, TEAM_LEAD, TEAM_LEAD_OR_OWNER, CUSTOM_USER 규칙 테스트가 존재한다.
- 자기 승인 방지, 반려/취소 사유 필수 여부, 증명자료 확인 후 승인 조건이 테스트된다.

## 휴가 캘린더 검수 결과

- `/leaves/calendar` route가 존재한다.
- PUBLIC_WITH_TYPE, PUBLIC_AS_LEAVE, PRIVATE_TO_APPROVERS 공개 범위 테스트가 존재한다.
- 캘린더 DTO에는 휴가 사유와 증명자료 정보가 포함되지 않도록 테스트된다.

## 관리자 리포트/CSV 검수 결과

- `/admin/reports`와 8개 리포트 route가 존재한다.
- CSV export는 OWNER만 가능하다.
- allowlist 기반 sanitize, UTF-8 BOM, CSV injection 방어 테스트가 통과했다.
- REPORT_EXPORTED AuditLog가 기록된다.

## 알림센터/JobRun/Cron 검수 결과

- `/notifications`, `/admin/jobs`, JobRun detail route가 존재한다.
- Job dry-run 3종이 통과했다.
- JobRun table 접근이 preflight에서 PASS다.
- cron secret 없을 때 로컬 preflight는 WARN이며, production에서는 실패하도록 설계되어 있다.

## 보안/개인정보/권한 검수 결과

- 민감정보 암호화 helper, `isEncryptedValue`, 마스킹 helper가 존재한다.
- AuditLog redaction과 sanitizer가 적용되어 있다.
- Notification metadata와 JobRun summary/error sanitizer가 적용되어 있다.
- CSV export에 token/tokenHash/passwordHash/fileKey/private path가 포함되지 않도록 테스트된다.
- invitation token/session token 원문 저장 금지 원칙이 유지된다.

## 실행한 명령과 결과

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm lint` | PASS |
| `corepack pnpm typecheck` | PASS |
| `corepack pnpm test` | PASS, 22 files / 126 tests |
| `corepack pnpm build` | PASS |
| `corepack pnpm db:validate` | PASS |
| `corepack pnpm db:generate` | PASS |
| `corepack pnpm db:seed` | PASS |
| `corepack pnpm db:status` | PASS, 14 migrations, DB up to date |
| `corepack pnpm preflight` | PASS with WARN |
| `corepack pnpm leave:ledger:validate` | PASS, issues 0 |
| `corepack pnpm jobs:birthday-half-day-grants -- --dry-run` | PASS |
| `corepack pnpm jobs:schedule-annual-promotion-notices -- --dry-run` | PASS |
| `corepack pnpm jobs:expire-annual-leaves -- --dry-run` | PASS |

## 실패한 명령과 원인

실패한 명령은 없다.

preflight WARN:

- 로컬 `.env`에 `CRON_SECRET`이 없다. 현재는 `/api/cron/*` route가 없고 CLI Job 중심 운영이므로 blocker는 아니지만, cron endpoint를 추가할 때는 반드시 설정해야 한다.
- 로컬 `.env`에 `MAX_LEAVE_ATTACHMENT_SIZE_MB`가 없다.
- `private/uploads` 디렉터리가 아직 없다.

## 수정한 문제

- 2차 기준 smoke test 문서를 UTF-8 체크리스트로 재작성했다.
- 2차 리허설 보고서를 작성했다.
- 2차 최종 인수 보고서를 작성했다.
- 운영 시작 순서와 3차 후보 문서를 추가했다.
- 주요 route/script/smoke 문서 누락을 감지하는 리허설 커버리지 테스트를 추가했다.

## 남은 blocker

없음.

## 남은 TODO

- 실제 HR 엑셀 fixture import를 private 경로에서 수행한다.
- 실제 브라우저에서 OWNER/LEAD/MANAGER 계정으로 대표 플로우를 클릭 검수한다.
- 운영 환경에 `CRON_SECRET`, `MAX_LEAVE_ATTACHMENT_SIZE_MB`, `PRIVATE_UPLOAD_DIR`를 확정한다.
- 첨부파일 운영 전 private upload dir 또는 외부 private storage/백업 정책을 준비한다.
- 기존 DB에 과거 평문 민감정보가 있다면 별도 암호화 migration 검토가 필요하다.

## 운영 전 대표가 확인해야 할 항목

1. 실제 HR 원장 import 결과가 예상과 일치하는지 확인.
2. 사전 프로필 검수와 직원 일괄 초대가 정상인지 확인.
3. 직원 가입 후 profile confirm이 정상인지 확인.
4. 연차/반차/맞춤휴가/생일 반차 요청과 승인 테스트.
5. 증명자료 필수 휴가와 사후 제출 휴가 테스트.
6. 캘린더 공개 범위와 민감 휴가 노출 여부 확인.
7. CSV export에 민감정보가 없는지 샘플 확인.
8. Job dry-run과 preflight 확인.
9. AuditLog에서 token/fileKey/주민번호/계좌가 노출되지 않는지 확인.

## 운영 시작 순서

자세한 순서는 `docs/v2-operation-start-sequence.md`를 따른다.

요약:

1. DB backup과 env secret 확인.
2. `pnpm db:deploy`, `pnpm db:seed`, `pnpm preflight`.
3. OWNER 로그인.
4. HR 엑셀 import.
5. 사전 프로필 검수.
6. 직원 초대와 profile confirm.
7. 휴가 유형, 맞춤휴가, 생일 반차, 연차 정책, 승인 정책 확인.
8. 직원 휴가 요청/승인 리허설.
9. 캘린더, 리포트, 알림센터, JobRun, AuditLog 확인.
10. 보안 체크리스트 확인.

## 3차 개발 후보 기능

자세한 후보는 `docs/v3-roadmap-candidates.md`에 정리했다.

주요 후보:

- 실제 이메일/카카오톡/Slack/SMS 알림
- Google Calendar, Outlook, iCal 연동
- S3/GCS/Azure Blob storage
- 바이러스 검사, OCR
- 전자계약, 근로계약서 전자서명
- 급여명세서, 연차수당, 퇴사자 정산
- 근태/출퇴근, 근무유형, 교대근무
- 업무 Task, 회의록, 성과관리, 프로젝트 이슈관리
- 모바일 최적화, 통계 대시보드
- SSO, MFA, IP allowlist, 관리자 권한 리뷰, key rotation

## 최종 사용 가능 여부

최종 판단: **2차 고도화 제한적으로 사용 가능**

제한적으로 판단한 이유:

- 자동 검증과 DB 검증은 모두 통과했고 blocker는 없다.
- 다만 실제 브라우저 기반 전체 업무 리허설과 실제 HR 엑셀 fixture import는 이번 자동 검수 범위 밖이므로, 운영 투입 직전 최종 클릭 검수가 필요하다.

운영 전 위 제한사항을 확인하면 실제 운영 사용으로 전환할 수 있다.
