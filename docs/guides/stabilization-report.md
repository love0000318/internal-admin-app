# 운영 전 안정화 보고서

## 안정화 작업 목적

문서 동기화 과정에서 발견된 blocker, PARTIAL 기능, 실제 구현과 문서의 불일치, 실행 명령 오류, 권한/보안 누락 가능성을 확인하고 운영 전 안정화 항목을 정리했다. 이번 작업에서는 신규 대형 기능을 추가하지 않고 문서와 검증 결과를 실제 코드 상태에 맞췄다.

## 확인한 문서

- `docs/guides/feature-status.md`
- `docs/guides/next-actions.md`
- `docs/guides/quick-checklist.md`
- `docs/guides/commands.md`
- `docs/guides/permission-matrix.md`
- `docs/guides/security-checklist.md`
- `docs/v2-final-acceptance-report.md`
- `docs/v2-rehearsal-report.md`
- `docs/smoke-test.md`
- `docs/security-smoke-test.md`
- `README.md`
- `AGENTS.md`

## 확인한 기능군

- 1차 MVP: 인증, OWNER, 조직/팀, 직원 초대/가입, 휴가 요청/승인, AuditLog
- HR: import, prejoin profile, 초대 연결, profile confirm, 자기 정보 수정, 민감정보 변경 요청
- 휴가: 유형, 맞춤휴가, 생일 반차, LeaveLedger, 연차 정책/촉진/소멸, 증명자료, 승인 정책, 캘린더
- 운영: 관리자 리포트, CSV export, 알림센터, JobRun, preflight
- 보안: token/session, 민감정보, 첨부파일, CSV, AuditLog, Notification, JobRun, 권한

## 발견한 P0 blocker

현재 자동 검증과 문서/코드 대조 기준으로 P0 blocker는 발견되지 않았다.

## 수정한 P0 blocker

없음.

## 남은 P0 blocker

없음.

## 발견한 P1 항목

- HR 사전 직원 프로필 전용 검수 화면 부재
  - 영향: 모델과 import script는 있으나 `/admin/hr/prejoin-profiles` route와 reviewStatus 필드는 없다.
  - 조치: `feature-status.md`, `next-actions.md`, `smoke-test.md`, 최종/리허설 보고서에서 PARTIAL로 정정했다.

- 사전 프로필 기반 일괄 초대 전용 화면 부재
  - 영향: 이메일 기준 연결 구조는 있으나 전용 일괄 초대 운영 화면은 없다.
  - 조치: PARTIAL/TODO로 정리했다.

- Cron endpoint route 부재
  - 영향: `assertCronRequestAuthorized` helper는 있으나 `/api/cron/*` route는 없다. 운영은 CLI Job 중심이다.
  - 조치: 최종/리허설 보고서와 smoke 문서를 PARTIAL/TODO로 정정했다.

- 기존 일부 문서 인코딩 깨짐
  - 영향: README, AGENTS, operation-guide 등 오래된 일부 문서가 콘솔에서 깨져 보일 수 있다.
  - 조치: 기능 코드에 영향이 없도록 신규 `docs/guides` 문서 묶음을 기준 운영 문서로 만들고, 기존 인코딩 정리는 문서 TODO로 분리했다.

- 운영 환경 준비 항목
  - 영향: preflight WARN으로 `CRON_SECRET`, `MAX_LEAVE_ATTACHMENT_SIZE_MB`, `private/uploads` 준비가 필요하다.
  - 조치: `next-actions.md`, `quick-checklist.md`, `security-checklist.md`에 운영 전 확인 항목으로 유지했다.

## 수정한 P1 항목

- Cron endpoint 상태를 COMPLETE에서 PARTIAL로 정정.
- HR prejoin/온보딩 상태를 실제 schema와 route 기준으로 PARTIAL 정정.
- smoke test의 cron endpoint 항목을 “구현된 경우”로 수정.
- security smoke test를 UTF-8 문서로 재작성하고 현재 CLI Job 중심 운영을 명시.
- `next-actions.md`를 P0/P1/P2/보안/문서/테스트 TODO 형식으로 재정리.

## 3차로 넘긴 P2 항목

- 실제 이메일/Slack/Kakao/SMS 알림
- Google Calendar/Outlook/iCal 연동
- 외부 private file storage와 바이러스 검사
- 전자계약/전자서명/급여명세서/퇴사자 정산
- 근태/출퇴근/근무유형/교대근무
- SSO/MFA/IP allowlist
- 통합 annual leave maintenance HTTP cron endpoint

## 실행한 명령과 결과

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm lint` | PASS |
| `corepack pnpm typecheck` | PASS |
| `corepack pnpm test` | PASS, 22 files / 126 tests |
| `corepack pnpm build` | PASS |
| `corepack pnpm db:validate` | PASS |
| `corepack pnpm db:generate` | PASS |
| `corepack pnpm preflight` | PASS with WARN |
| `corepack pnpm leave:ledger:validate` | PASS, issues 0 |
| `corepack pnpm jobs:birthday-half-day-grants -- --dry-run` | PASS |
| `corepack pnpm jobs:schedule-annual-promotion-notices -- --dry-run` | PASS |
| `corepack pnpm jobs:expire-annual-leaves -- --dry-run` | PASS |

## preflight WARN

- `CRON_SECRET` 미설정: 현재 `/api/cron/*` route가 없으므로 blocker는 아니지만 HTTP cron 도입 시 필수.
- `MAX_LEAVE_ATTACHMENT_SIZE_MB` 미설정: 운영 `.env`에 명시 권장.
- `private/uploads` 미생성: 실제 local attachment upload 전 생성 필요.

## 테스트 보강 내용

이번 작업에서는 코드 변경이 없었고, 기존 테스트 126개가 통과했다. 새 테스트 추가는 없으며, 문서 불일치 수정과 실행 검증을 수행했다.

## 보안/권한 점검 결과

- 자동 테스트와 preflight 기준 보안/권한 P0는 발견되지 않았다.
- CSV export, 첨부 다운로드, AuditLog/Notification/JobRun sanitizer, token/session hash 원칙은 기존 테스트와 문서 기준 유지된다.
- Cron endpoint는 route가 없으므로 외부 노출 P0가 아니며, 향후 route 추가 시 `CRON_SECRET` guard 적용이 필요하다.

## 실제 운영 가능 여부

최종 판단: **제한적으로 운영 가능**

제한 사유:

- HR prejoin 전용 검수/일괄 초대 화면은 PARTIAL이므로 현재는 import script, 초대 화면, HR 리포트 중심으로 운영해야 한다.
- Cron endpoint는 현재 없으며, 운영 Job은 CLI 또는 서버 scheduler로 실행해야 한다.
- 실제 운영 HR 엑셀과 브라우저 smoke test는 운영 전 수동 검증이 필요하다.

## 다음 단계 제안

1. 운영 `.env`와 `private/uploads`를 준비한다.
2. 실제 HR 엑셀 fixture로 `pnpm hr:import` 리허설을 수행한다.
3. OWNER/LEAD/MANAGER 브라우저 smoke test를 수행한다.
4. P1 항목인 HR prejoin 검수 화면과 일괄 초대 화면을 2차 안정화 후속 작업으로 계획한다.
5. HTTP cron이 필요해지는 시점에 `/api/cron/*` route를 `CRON_SECRET` guard와 함께 추가한다.
