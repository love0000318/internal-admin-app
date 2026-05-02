# 배포 후 Smoke Test

운영 배포 직후 대표 또는 운영자가 확인할 체크리스트입니다.

## 기본 접속

- [ ] 배포 URL에 접속한다.
  - 기대 결과: 로그인 또는 초대 수락 화면이 열린다.
  - 실패 시 확인할 것: Vercel deployment status, `APP_BASE_URL`, build log

- [ ] `/api/health`를 호출한다.
  - 기대 결과: 민감정보 없이 정상 응답한다.
  - 실패 시 확인할 것: route 배포 여부, runtime error

## OWNER

- [ ] OWNER 초대 URL로 가입하거나 기존 OWNER로 로그인한다.
  - 기대 결과: `/dashboard` 접근 가능
  - 실패 시 확인할 것: seed 실행 여부, invitation 만료, session secret

- [ ] 대시보드에 접근한다.
  - 기대 결과: 관리자 메뉴와 요약 정보가 표시된다.
  - 실패 시 확인할 것: role/status, session cookie

## 직원 초대와 가입

- [ ] OWNER가 직원을 초대한다.
  - 기대 결과: 초대 링크가 생성된다.
  - 실패 시 확인할 것: OWNER 권한, invitation token hash

- [ ] 직원이 초대 링크로 가입한다.
  - 기대 결과: 직원 상태가 ACTIVE가 된다.
  - 실패 시 확인할 것: 초대 만료, 이미 사용된 링크, password policy

## 휴가 기본 흐름

- [ ] 직원이 연차 또는 반차를 요청한다.
  - 기대 결과: `PENDING` 요청 생성
  - 실패 시 확인할 것: 잔여 수량, 중복 요청, 휴가 정책

- [ ] OWNER 또는 담당 LEAD가 승인한다.
  - 기대 결과: `APPROVED` 전환, LeaveLedger 반영
  - 실패 시 확인할 것: 승인 정책, LEAD 담당 팀, ledger 기록

## 자동 확정 Job

- [ ] 자동 확정 Job dry-run을 실행한다.
  - 명령: `pnpm jobs:auto-confirm-past-start-leaves -- --dry-run`
  - 기대 결과: 대상/제외/실패 건수가 출력되고 DB 변경은 없다.
  - 실패 시 확인할 것: `DATABASE_URL`, package script, ApprovalPolicy

- [ ] Vercel cron endpoint를 secret과 함께 수동 호출한다.
  - endpoint: `/api/cron/auto-confirm-past-start-leaves`
  - 기대 결과: `ok: true` 응답과 JobRun 기록
  - 실패 시 확인할 것: `CRON_SECRET`, Authorization header

## 기타 Job

- [ ] 생일 반차 Job dry-run을 실행한다.
  - 명령: `pnpm jobs:birthday-half-day-grants -- --dry-run`
  - 기대 결과: 대상/생성/스킵 건수 확인

- [ ] 연차 촉진 schedule Job dry-run을 실행한다.
  - 명령: `pnpm jobs:schedule-annual-promotion-notices -- --dry-run`
  - 기대 결과: 촉진 대상 후보 확인

- [ ] 연차 소멸 Job dry-run을 실행한다.
  - 명령: `pnpm jobs:expire-annual-leaves -- --dry-run`
  - 기대 결과: 소멸 후보 확인

## 증명자료

- [ ] storage가 준비된 경우 증명자료 업로드를 테스트한다.
  - 기대 결과: public 경로가 아닌 private storage에 저장되고 권한 있는 사용자만 다운로드 가능
  - 실패 시 확인할 것: `LEAVE_ATTACHMENT_STORAGE`, `PRIVATE_UPLOAD_DIR`, 운영 object storage adapter

주의: Vercel serverless에서 local storage는 영구 저장소로 권장하지 않습니다.

## 캘린더와 리포트

- [ ] 휴가 캘린더에 승인된 휴가가 표시되는지 확인한다.
  - 기대 결과: 공개 범위에 따라 민감 정보가 숨겨진다.

- [ ] 관리자 리포트에서 CSV export를 실행한다.
  - 기대 결과: 민감정보, token, fileKey, private path가 포함되지 않는다.

## 알림센터 / JobRun / AuditLog

- [ ] 알림센터에서 내 알림만 보이는지 확인한다.
- [ ] `/admin/jobs`에서 JobRun 기록을 확인한다.
- [ ] `/admin/audit-logs`에서 주요 작업 로그를 확인한다.

## 권한 차단

- [ ] MANAGER가 `/admin/reports` 접근을 시도한다.
  - 기대 결과: 접근 차단

- [ ] EXTERNAL_PARTNER가 내부 기능 접근을 시도한다.
  - 기대 결과: 접근 차단

- [ ] 비로그인 사용자가 protected route에 접근한다.
  - 기대 결과: 로그인 또는 접근 차단

## 최종 판단

- [ ] build/test/preflight 결과와 smoke test 결과를 운영 기록에 남긴다.
- [ ] P0 blocker가 없으면 운영 시작 가능으로 판단한다.
- [ ] 증명자료 파일 운영 저장소가 준비되지 않았다면 파일 첨부 운영은 제한적으로 시작한다.
## 내부 단축 초대 URL 점검

- [ ] OWNER가 직원 초대를 생성한다.
  - 기대 결과: `/i/[shortToken]` 형태의 내부 단축 초대 URL과 가입 인증 코드가 생성 직후 한 번 표시된다.
  - 실패 시 확인할 것: `APP_BASE_URL`, `Invitation.shortTokenHash`, `shortTokenExpiresAt`.

- [ ] 직원이 단축 초대 URL과 가입 인증 코드로 가입한다.
  - 기대 결과: 가입 완료 후 단축 URL과 가입 인증 코드는 재사용할 수 없다.
  - 실패 시 확인할 것: `shortTokenConsumedAt`, `verificationCodeConsumedAt`, invitation status.
