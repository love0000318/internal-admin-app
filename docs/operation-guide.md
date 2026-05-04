# 운영 가이드

이 문서는 Internal Ops 운영자가 배포 전후 확인해야 할 절차를 정리한다. 실제 secret, token, DB URL은 문서에 기록하지 않는다.

## 1. 배포 전 확인

- [ ] `lint`, `typecheck`, `test`, `build`가 통과했다.
- [ ] `db:validate`, `db:generate`가 통과했다.
- [ ] 운영 DB 백업을 확인했다.
- [ ] 운영 DB에는 `prisma migrate reset`을 절대 사용하지 않는다.
- [ ] Vercel production env가 `.env.production.example`의 필수 항목을 포함한다.
- [ ] production에서 mock/dev 인증이 차단된다.
- [ ] 외부 이메일/Slack 알림을 사용하지 않으면 명시적으로 비활성화한다.
- [ ] local private attachment storage를 production 장기 저장소로 사용하지 않는다.

## 2. 운영 DB migration

운영 DB에는 다음 명령만 사용한다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
```

금지:

```powershell
corepack pnpm prisma migrate reset
corepack pnpm db:migrate
```

`db:migrate`는 개발 DB 전용이다.

## 3. production seed

최초 OWNER 초대 또는 기본 정책 seed가 필요할 때만 실행한다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm db:seed
```

seed 출력에 초대 URL과 1회용 가입 인증 코드가 표시될 수 있다. 이 값은 생성 직후 한 번만 안전하게 전달하고, 문서나 티켓에 저장하지 않는다.

## 4. preflight

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm preflight
```

확인 항목:

- 필수 env 존재
- secret 길이와 중복 여부
- production mock 인증 차단
- 주요 package script 존재
- DB 연결
- OWNER 또는 OWNER 초대 존재
- 기본 휴가 정책 seed
- 외부 알림 설정 상태

## 5. Vercel 환경변수

필수 후보:

- `DATABASE_URL`
- `APP_BASE_URL`
- `NODE_ENV=production`
- `APP_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_SECRET`
- `TOKEN_SECRET`
- `INVITATION_TOKEN_SECRET`
- `INVITATION_SHORT_TOKEN_SECRET`
- `INVITATION_VERIFICATION_CODE_SECRET`
- `CRON_SECRET`
- `SESSION_EXPIRES_IN_DAYS`
- `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS`
- `STEP_UP_EXPIRES_IN_MINUTES`
- `STEP_UP_MAX_ATTEMPTS`
- `INVITATION_VERIFICATION_CODE_EXPIRES_IN_DAYS`
- `INVITATION_VERIFICATION_CODE_MAX_ATTEMPTS`
- `INVITATION_VERIFICATION_CODE_LENGTH`

외부 이메일/Slack을 사용하지 않는 운영:

- `EMAIL_PROVIDER=none`
- `EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED=false`
- `SLACK_NOTIFICATIONS_ENABLED=false`

실제 값은 Vercel dashboard에서만 관리한다.

## 6. 배포 명령

Vercel CLI가 설치되고 로그인되어 있는 운영자 환경에서 실행한다.

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build

$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
corepack pnpm db:seed
corepack pnpm preflight

vercel --prod
```

현재 작업 환경에서는 `vercel.cmd`가 설치되어 있지 않아 실제 Vercel env 조회와 배포 실행은 수행하지 못했다.

## 7. 배포 후 smoke test

1. OWNER 로그인
2. 직원 초대 생성
3. 단축 초대 URL과 가입 인증 코드 확인
4. 직원 가입
5. 직원 휴가 요청
6. OWNER 휴가 승인
7. 알림센터 확인
8. 보안 대시보드 확인
9. AuditLog 확인
10. 모바일에서 `/login`, `/invitations/accept`, `/leaves/me`, `/leaves/me/requests/new`, `/admin/leaves/settings`, `/notifications` 확인
11. 비활성 직원 삭제/익명화 테스트
12. 캘린더 구독 링크 생성과 ICS 응답 확인
13. 근태 기능을 릴리즈에 포함한다면 `/attendance`, `/attendance/history`, `/admin/attendance` 확인

## 8. 현재 3차 RC 주의사항

- 2026-05-04 기준 코드에서 `/attendance`, `/attendance/history`, `/admin/attendance`, `src/lib/attendance`가 확인되지 않는다.
- 근태/출퇴근을 3차 릴리즈 범위에 포함한다면 배포 전 구현과 QA가 필요하다.
- 근태를 제외한 휴가/초대/보안/UI 범위는 코드 품질 게이트가 통과했지만, 운영 Neon DB migration과 production smoke test가 완료되어야 한다.

## 9. 직원 오픈 전 확인

운영 URL:

```txt
https://interal-admin-app.vercel.app
```

2026-05-04 기준 production URL은 HTTP 200과 title `Internal Ops MVP` 응답을 확인했다. 인증 기반 smoke test는 OWNER/직원 테스트 계정이 필요하므로 운영자가 직접 수행한다.

직원 오픈 전 필수 확인:

- [ ] OWNER 로그인
- [ ] 테스트 직원 초대/가입
- [ ] 직원 휴가 요청
- [ ] OWNER 휴가 승인
- [ ] 알림센터 확인
- [ ] 보안 대시보드 확인
- [ ] AuditLog 확인
- [ ] 모바일 주요 화면 확인
- [ ] 근태 포함 여부 결정

직원 오픈은 한 번에 전체 직원에게 하지 않고 1차 대표+테스트 직원, 2차 핵심 운영 직원, 3차 전체 직원 순서로 진행한다.

관련 문서:

- `docs/employee-onboarding-message.md`
- `docs/owner-operation-checklist.md`
- `docs/production-incident-runbook.md`
- `docs/production-readiness-report.md`
- `docs/v3-post-deploy-smoke-test.md`
- `docs/v3-production-deployment-guide.md`
# 휴가 사용내역 엑셀 import

OWNER는 `/admin/leaves/import`에서 월별 연차 사용 내역 또는 휴가 사용 상세 내역 `.xlsx` 파일을 업로드할 수 있습니다. 업로드는 즉시 반영되지 않으며, 미리보기에서 직원 매칭/휴가 유형/상태/경고/오류를 확인한 뒤 Step-up 재인증 후 최종 반영합니다.

원본 엑셀 파일은 public에 저장하지 않고 서버에서 파싱합니다. 자세한 절차는 [휴가 사용내역 엑셀 import 가이드](./leave-import-guide.md)를 확인하세요.

운영자는 최종 반영 전 정상 반영 가능 row, 오류 row, UNKNOWN 상태 row, 중복 의심 row를 확인해야 합니다. 반영 후에는 batch 상세 화면에서 생성된 LeaveRequest/LeaveLedger/LeaveAdjustment 수와 월별 잔여 연차 reconciliation 결과를 확인합니다.

운영 리허설과 실제 반영 전 확인에는 다음 문서를 함께 사용합니다.

- [휴가 Import 운영 리허설 Runbook](./leave-import-operation-runbook.md)
- [휴가 Import 최종 반영 전 체크리스트](./leave-import-pre-apply-checklist.md)
- [휴가 Import QA Report](./leave-import-qa-report.md)
- [휴가 Import 실제 운영 반영 Runbook](./leave-import-live-apply-runbook.md)
- [휴가 Import 실제 운영 반영 전 체크리스트](./leave-import-live-apply-checklist.md)
- [휴가 Import 반영 후 정합성 검증 템플릿](./leave-import-post-apply-verification.md)
- [휴가 Import 장애 대응 Runbook](./leave-import-incident-runbook.md)
- [구성원 휴가 현황 엑셀 업로드 가이드](./leave-balance-import-guide.md)

### 휴가 현황 업로드 운영 보조 기능

- OWNER는 `/admin/leaves/import`에서 `엑셀 템플릿 다운로드`를 눌러 ACTIVE 내부 직원과 현재 LeaveLedger 기준 참고값이 포함된 템플릿을 받을 수 있습니다.
- 템플릿에는 직원명, 이메일, 사번, 팀, 기준연도, 총 부여 연차, 사용 연차, 승인대기 연차, 잔여 연차, 조정 메모만 포함합니다. 주민등록번호, 계좌번호, 주소, 급여, 가족정보 등 민감정보는 포함하지 않습니다.
- 업로드 이력은 `/admin/leaves/import`에서 확인하고, 각 batch 상세는 `/admin/leaves/import/[batchId]`에서 확인합니다.
- 잘못 반영한 APPLIED 월별 휴가 현황 batch는 삭제하지 않고 `업로드 반영 취소`로 역조정합니다. 이때 기존 LeaveAdjustment/LeaveLedger/LeaveRequest는 삭제하지 않고 반대 방향 LeaveAdjustment와 LeaveLedger `IMPORT_REVERSE_ADJUSTMENT` 이벤트를 추가합니다.
- 반영 취소도 OWNER만 가능하며 Step-up 재인증이 필요합니다.

## 구성원 휴가 현황 운영 기준

`/admin/leaves/balances` 화면은 구성원 휴가 보유, 사용 완료, 승인 대기, 잔여, 맞춤휴가, 생일 반차 잔여를 확인하는 운영 화면입니다.

- OWNER는 전체 ACTIVE 내부 구성원의 휴가 현황을 조회할 수 있습니다.
- LEAD는 자신이 lead로 지정된 팀과 하위 팀에 속한 ACTIVE 구성원만 조회할 수 있습니다.
- MANAGER는 구성원 목록 화면에 접근할 수 없고 `/leaves/me`에서 본인 휴가만 확인합니다.
- EXTERNAL_PARTNER는 내부 휴가 현황에 접근할 수 없습니다.

휴가 현황 목록과 상세 화면은 서버에서 현재 사용자의 scope를 계산한 뒤 해당 userId만 조회합니다. 주민등록번호, 계좌번호, 주소, 급여 정보, 가족 정보, 증명자료 파일 내용은 휴가 현황 화면에 표시하지 않습니다.

## 구성원 휴가 현황/엑셀 업로드 배포 운영 메모

- 운영 DB에는 `prisma migrate deploy`만 사용합니다. `prisma migrate reset`과 production 대상 `prisma migrate dev`는 금지합니다.
- 휴가 현황 엑셀 업로드는 과거 휴가 요청 이력을 복원하는 기능이 아니라 현재 휴가 잔여를 맞추기 위한 조정 기능입니다.
- 반영 전 미리보기에서 직원 매칭, 기준연도, 오류/경고 행, 조정 예정값을 반드시 확인합니다.
- 최종 반영과 반영 취소는 OWNER만 가능하며 Step-up 재인증이 필요합니다.
- 잘못 반영한 경우 기존 LeaveRequest, LeaveLedger, LeaveAdjustment를 삭제하지 않고 반대 방향 조정 이벤트로 역조정합니다.
- 배포 후 검수는 `docs/leave-balance-import-post-deploy-smoke-test.md`를 따릅니다.
## 회계연도 휴가 소멸일 보정 운영

회계연도 기준으로 지급되는 휴가는 지급 연도 말일인 12월 31일까지 유효합니다. 예를 들어 2026년에 지급된 연차/연차성 조정 휴가는 2026-12-31에 소멸하며 2027년 잔여에 포함하지 않습니다. 생일 반차 등 별도 유효기간을 가진 휴가는 해당 정책을 따릅니다.

기존 데이터에 2026년 지급분이 2027-12-31로 저장된 경우 운영 DB에서는 반드시 dry-run을 먼저 실행해 대상 건수를 확인합니다.

```bash
pnpm jobs:fix-fiscal-year-leave-expirations -- --dry-run --year=2026
pnpm jobs:fix-fiscal-year-leave-expirations -- --apply --year=2026
```

`--dry-run`은 DB를 변경하지 않고 JobRun/AuditLog에 실행 요약만 남깁니다. `--apply`는 대상 `LeaveGrant.expiresAt`과 회계연도성 `LeaveLedger.expiresAt`만 지급 연도 12월 31일로 보정합니다. 운영 DB에서 `prisma migrate reset`은 절대 사용하지 않습니다.
## 휴가 import 기준연도 운영 주의

- 휴가 현황 엑셀 업로드의 기준연도는 직원 입사연도가 아니라 반영 대상 휴가 연도다.
- 2026년 휴가 현황을 업로드할 때는 업로드 화면 기준연도를 2026으로 선택한다.
- 엑셀에 기준연도 컬럼이 없으면 업로드 화면의 기준연도가 batch 기준연도로 저장된다.
- 엑셀 기준연도와 업로드 화면 기준연도가 다르면 미리보기에서 오류 row를 확인하고 파일 또는 선택값을 수정한다.
- 이미 잘못 생성된 미반영 batch는 `jobs:fix-leave-import-reference-year -- --dry-run --from=2019 --to=2026`으로 먼저 확인한 뒤 필요한 경우에만 apply한다.
- 적용 명령은 `jobs:fix-leave-import-reference-year -- --apply --from=2019 --to=2026`이다.
- APPLIED 또는 REVERSED batch는 기본 보정 대상에서 제외한다. 이미 반영된 batch는 역조정/취소 후 재업로드하는 절차를 따른다.
