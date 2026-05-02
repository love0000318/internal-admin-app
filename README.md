# Internal Admin App MVP

회사 내부 관리 앱/웹 서비스 MVP입니다. Next.js App Router, TypeScript, PostgreSQL, Prisma, Tailwind CSS 기반으로 초대 가입, 로그인/세션, 조직/직원 관리, 휴가 요청/승인, 감사 로그까지 운영 가능한 1차 범위를 제공합니다.

## MVP 기능

- 초대 링크 기반 OWNER/직원 가입
- 전화번호 + 비밀번호 로그인, 로그아웃, 서버 세션
- 역할별 좌측 메뉴와 route/server action 권한 검증
- 대시보드: 사용자 정보, 내 휴가 요약, 승인 대기 요약, Task/회의 placeholder
- 조직/팀 생성, 수정, 비활성화
- 직원 초대, 초대 취소/재발급, 직원 상세/수정/비활성화
- 휴가 정책, 회사 휴일, 직원별 휴가 조정
- 내 휴가 보유 현황, 휴가 요청, PENDING 요청 철회
- OWNER/LEAD 휴가 승인, 반려, 승인 취소
- OWNER 감사 로그 조회와 민감정보 마스킹

## MVP 제외 기능

업무 Task 관리, 회의 일정/회의록, 성과 관리, 프로젝트 이슈 관리, 외부 스포츠 시설 운영자 페이지, 외부 게시물 승인/작성, 실제 이메일 발송, 실제 본인인증 업체, 파일 스토리지, 알림, 휴가 캘린더, 관리자 통계 대시보드, 급여/근태 연동은 2차 개발 후보로만 남깁니다.

## 기술 스택

- Next.js App Router + React + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- 자체 전화번호 로그인/세션
- bcrypt high cost password hash
- Vitest unit/integration/e2e smoke

## 권한 체계

- `OWNER`: 전체 권한. 조직/직원, 휴가 정책, 휴가 승인/반려/취소, 감사 로그 조회 가능.
- `LEAD`: 자신이 관리하는 팀과 하위 팀 직원의 휴가 요청만 조회/승인/반려/취소 가능. 자기 휴가는 처리 불가.
- `MANAGER`: 자기 휴가 조회/요청/철회만 가능.
- `EXTERNAL_PARTNER`: MVP 내부 기능 접근 불가.

모든 protected page와 server action은 UI 메뉴 숨김과 별개로 서버에서 권한을 다시 검사합니다.

## 로컬 개발 실행

```bash
pnpm install
pnpm db:generate
pnpm dev
```

기본 주소는 `http://localhost:3000`입니다.

## PostgreSQL 로컬 실행

이 앱은 PostgreSQL이 필요합니다. 로컬에 PostgreSQL이 없다면 Docker가 설치된 환경에서 다음 명령으로 개발 DB를 띄울 수 있습니다.

```bash
docker run --name internal-admin-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=internal_ops_mvp \
  -p 5432:5432 \
  -d postgres:16
```

이미 컨테이너가 있으면 다음 명령으로 다시 시작합니다.

```bash
docker start internal-admin-postgres
```

Docker를 사용할 수 없는 Windows 환경이라면 PostgreSQL 16 이상을 직접 설치하고 `.env`의 `DATABASE_URL`에 맞춰 `internal_ops_mvp` 데이터베이스를 생성하세요.

## 환경변수

로컬은 `.env.example`, 운영은 `.env.production.example`을 기준으로 설정합니다. 실제 secret은 예시값을 그대로 쓰지 말고 32자 이상의 랜덤 값으로 교체해야 합니다.

주요 변수:

- `DATABASE_URL`
- `APP_BASE_URL`
- `NODE_ENV`
- `APP_SECRET`
- `SESSION_SECRET`
- `TOKEN_SECRET`
- `INVITATION_TOKEN_SECRET`
- `INVITATION_EXPIRES_IN_DAYS`
- `SESSION_EXPIRES_IN_DAYS`
- `COOKIE_DOMAIN`
- `IDENTITY_VERIFICATION_PROVIDER`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_NAME`
- `SEED_OWNER_TITLE`

production에서 mock 본인인증 provider는 실행되면 즉시 에러가 나야 합니다. 실제 provider가 붙기 전 운영에서는 사전 등록 정보 기반의 수동 검수 절차를 함께 운영하세요.

## DB Migration

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:status
```

개발 환경에서는 `pnpm db:migrate`를 사용합니다. 운영 배포 전에는 DB 백업 후 다음 명령으로 migration을 적용하고 `pnpm db:status`로 상태를 확인합니다.

```bash
pnpm db:deploy
pnpm db:status
```

## Seed 및 최초 OWNER

```bash
pnpm db:seed
```

seed는 `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_TITLE`을 읽어 OWNER 초대 레코드를 생성합니다. 초대 token 원문은 콘솔에 한 번만 출력되고 DB에는 hash만 저장됩니다.

출력 예:

```text
Owner invitation URL:
https://your-domain.com/invitations/accept?token=...
```

## 실제 사용 시작 순서

1. `pnpm install`
2. `.env.example`을 기준으로 `.env`를 설정
3. PostgreSQL 실행 또는 Docker 컨테이너 시작
4. `pnpm db:generate`
5. `pnpm db:migrate`
6. `pnpm db:seed`
7. 콘솔에 출력된 OWNER 초대 URL 복사
8. `pnpm dev`
9. 브라우저에서 OWNER 초대 URL 접속
10. 대표 계정 생성 후 `/dashboard` 진입
11. 조직/팀 생성
12. 직원 초대 링크 생성 및 전달
13. 직원 가입/로그인
14. 직원 휴가 요청
15. OWNER 또는 담당 LEAD 휴가 승인/반려/취소
16. `/admin/audit-logs`에서 감사 로그 확인

## 주요 Route

- Public: `/login`, `/invitations/accept`, `/api/health`
- 공통 로그인 사용자: `/dashboard`, `/leaves/me`, `/leaves/me/requests/new`, `/leaves/me/requests/[requestId]`
- OWNER/LEAD: `/leaves/approvals`, `/leaves/approvals/[requestId]`, `/leaves/approvals/approved`
- OWNER only: `/organization`, `/organization/teams`, `/organization/employees`, `/organization/invitations`, `/admin/leaves/settings`, `/admin/leaves/holidays`, `/admin/leaves/balances`, `/admin/audit-logs`

## 테스트와 점검

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm e2e
pnpm build
pnpm db:validate
pnpm db:generate
pnpm preflight
```

`pnpm preflight`는 `.env`, `.env.local`, production일 때 `.env.production`을 읽은 뒤 필수 env, secret 길이, production mock 차단, DB 연결, ACTIVE OWNER 또는 PENDING OWNER invitation, 기본 LeavePolicy 존재 여부를 점검합니다. 필수 env가 없거나 DB가 떠 있지 않으면 실패하는 것이 정상입니다.

## Health Check

공개 health endpoint:

```text
GET /api/health
```

응답에는 민감정보나 DB 상태를 포함하지 않습니다. deep health는 `pnpm preflight` 또는 운영자 전용 절차로 확인합니다.

## 운영 문서

- [배포 가이드](docs/deployment-guide.md)
- [지금 바로 실행하기](docs/how-to-run-now.md)
- [운영 가이드](docs/operation-guide.md)
- [대표 시작 가이드](docs/owner-start-guide.md)
- [대표 첫 실행 가이드](docs/owner-first-run.md)
- [직원 가이드](docs/employee-guide.md)
- [직원 첫 사용 가이드](docs/employee-first-run.md)
- [관리자 가이드](docs/admin-guide.md)
- [LEAD 휴가 승인 가이드](docs/lead-approval-guide.md)
- [Smoke Test](docs/smoke-test.md)
- [수동 리허설 절차](docs/manual-rehearsal.md)
- [운영 전 리허설 보고서](docs/rehearsal-report.md)
- [백업/복구 가이드](docs/backup-and-recovery.md)
- [배포 전 체크리스트](docs/release-checklist.md)
- [Production Readiness Report](docs/production-readiness-report.md)
- [최종 인수 보고서](docs/final-acceptance-report.md)
- [연차 정책 운영 가이드](docs/annual-leave-policy-guide.md)
- [연차 촉진 운영 가이드](docs/annual-leave-promotion-guide.md)
- [휴가 증명자료 제출 및 검수 가이드](docs/leave-attachment-guide.md)

## 배포 방식 요약

- 추천: Vercel + managed PostgreSQL
- 대안: Docker/VPS 또는 회사 내부 서버
- 참고 파일: `Dockerfile`, `docker-compose.example.yml`

## 보안 주의사항

- 비밀번호 원문, invitation token 원문, session token 원문은 저장하지 않습니다.
- cookie는 httpOnly, sameSite lax 이상이며 production에서는 secure입니다.
- 초대 링크는 1회 사용 후 재사용할 수 없습니다.
- DEACTIVATED/SUSPENDED 사용자는 로그인할 수 없습니다.
- 마지막 OWNER 비활성화와 권한 강등은 차단합니다.
- AuditLog 화면은 password/token/session/hash/attachment URL 계열 값을 마스킹합니다.
- 오류 화면에는 stack trace를 노출하지 않습니다.

## 알려진 TODO

- 실제 PostgreSQL 운영 DB에서 migration/seed/preflight 최종 확인
- Playwright 브라우저 기반 E2E 시나리오 확장
- 실제 이메일 발송 연동
- 실제 본인인증 업체 연동
- 파일 업로드 스토리지 연동
- 휴가 요청 수정, 휴가 캘린더, 알림, 통계 대시보드
- 정책별 연간 최대 사용일 enforcement 고도화

## 2차 휴가 고도화 계획

1차 MVP의 휴가 요청/승인 흐름은 유지하고, 2차에서는 정책 기반 휴가 관리로 확장할 계획입니다. 핵심 방향은 연차와 맞춤휴가를 분리하고, 맞춤휴가를 관리자가 생성/지급할 수 있게 하며, 휴가 잔여 변화를 장부처럼 추적하는 것입니다.

2차 고도화는 대규모 schema 변경을 포함할 수 있으므로 바로 migration을 만들지 않고, 아래 문서를 기준으로 요구사항과 데이터 모델을 먼저 확정합니다.

- [flex형 휴가 기능 분석](docs/flex-leave-research.md)
- [2차 휴가 고도화 요구사항](docs/leave-v2-requirements.md)
- [2차 휴가 데이터 모델 설계 초안](docs/leave-v2-data-model-plan.md)
- [2차 휴가 고도화 로드맵](docs/leave-v2-roadmap.md)
- [2차 휴가 고도화 위험 검토](docs/leave-v2-risk-review.md)

2차에서 우선 검토할 항목:

- 연차와 맞춤휴가 개념 분리
- 관리자 생성형 맞춤휴가 유형
- 맞춤휴가 직원 지급
- `LeaveLedger` 기반 휴가 장부
- `LeaveRequestSegment` 기반 날짜별/단위별 요청 구조
- 증명자료 metadata 정책
- 휴가 유형별 승인 정책 확장

3차 이후로 미룰 항목:

- 연차 촉진
- 퇴직자 정산
- 연차수당 계산
- 실제 파일 스토리지
- 외부 캘린더/알림 연동
- 복잡한 순차 승인 전체 구현
## 인사정보 원장 import와 직원 셀프 프로필

2차 인사정보 보강으로 `private/imports/employee-master.xlsx` 형태의 비공개 엑셀 원장을 import할 수 있습니다. 원본 파일은 `public/`에 두지 않고 git에 커밋하지 않습니다.

```bash
pnpm hr:import private/imports/employee-master.xlsx
```

필수 환경변수에 `ENCRYPTION_SECRET`이 추가되었습니다. 주민등록번호/외국인등록번호와 계좌번호는 암호화 저장하고, 화면과 AuditLog에는 원문을 노출하지 않습니다.

직원 초대 시 이메일이 import된 사전 프로필과 일치하면 초대에 자동 연결됩니다. 직원이 초대 링크로 가입하면 `/profile/confirm`에서 자동 입력된 인사정보를 확인하고, `/profile/edit`에서 허용된 항목을 직접 수정하거나 민감정보 변경 요청을 제출할 수 있습니다. OWNER는 `/admin/profile-change-requests`에서 변경 요청을 승인/반려합니다.

상세 절차는 [인사정보 원장 import 가이드](docs/employee-master-import-guide.md)를 참고하세요.
## LeaveLedger 휴가 장부

2차 4단계부터 휴가 부여, 대기, 사용, 철회, 반려, 승인 취소, 회수 이력을 `LeaveLedger`에 기록합니다. 기존 `LeaveAdjustment`, `LeaveGrant`, `LeaveRequest`는 유지하며 장부가 잔여 계산의 추적 근거가 됩니다.

- 운영 재구성: `pnpm leave:ledger:rebuild`
- 운영 검증: `pnpm leave:ledger:validate`
- 관리자 이력 화면: `/admin/leaves/history`
- 상세 문서: [LeaveLedger 휴가 장부 가이드](docs/leave-ledger-guide.md)

## AnnualLeavePolicy 연차 정책

2차 고도화에서는 회사의 현재 기준을 `AnnualLeavePolicy`로 저장합니다. 기본값은 회계일 1월 1일, 반차 단위 사용, 당겨쓰기 미허용, 월차 1일, 1년 이상자 기본 15일, 최대 25일, 연차 촉진 사용입니다.

- OWNER 설정 화면: `/admin/leaves/annual-policy`
- 촉진 일정 생성: `pnpm leave:promotion:schedule`
- 촉진 알림 발송: `pnpm jobs:send-annual-promotion-notices`
- 연차 소멸 미리보기/실행: `pnpm jobs:expire-annual-leaves -- --dry-run`
- 상세 문서: [연차 정책 운영 가이드](docs/annual-leave-policy-guide.md)
- 촉진 운영 문서: [연차 촉진 운영 가이드](docs/annual-leave-promotion-guide.md)

첫 회계연도 부여 방식과 실제 개근 판단은 운영 전 사용자 확인과 노무 검토가 필요합니다.

## 휴가 증명자료 제출 및 검수

- 휴가 유형별 `attachmentPolicy`에 따라 요청 전 필수, 요청 후 제출, 선택 제출을 구분합니다.
- 첨부파일은 `public/`이 아니라 `private/uploads/leave-attachments`에 저장하고, 인증된 다운로드 route에서 권한을 다시 확인합니다.
- 로컬 기본값은 `LEAVE_ATTACHMENT_STORAGE=local`, `MAX_LEAVE_ATTACHMENT_SIZE_MB=10`, `PRIVATE_UPLOAD_DIR=private/uploads`입니다.
- 운영 환경에서는 외부 private storage와 파일 보안 검토, 바이러스 검사 도입이 필요합니다.
- 상세 문서: [휴가 증명자료 제출 및 검수 가이드](docs/leave-attachment-guide.md)

## 운영 문서

2차 고도화 이후 운영 문서는 `docs/guides` 아래의 문서 묶음을 기준으로 확인합니다.

- [운영 문서 목차](docs/guides/index.md)
- [사용 가이드](docs/guides/usage-guide.md)
- [기능 안내서](docs/guides/feature-guide.md)
- [동작 플로우 안내서](docs/guides/flow-guide.md)
- [운영 빠른 체크리스트](docs/guides/quick-checklist.md)
- [기능 상태표](docs/guides/feature-status.md)
- [실행 명령 모음](docs/guides/commands.md)
- [권한 매트릭스](docs/guides/permission-matrix.md)
- [데이터 모델 요약](docs/guides/data-model-summary.md)
- [보안 운영 체크리스트](docs/guides/security-checklist.md)
- [다음 작업 목록](docs/guides/next-actions.md)

실제 구현 상태는 `docs/guides/feature-status.md`를 우선 기준으로 봅니다. 구현되지 않은 기능은 완료된 기능으로 운영하지 말고 TODO 또는 다음 개발 항목으로 분리합니다.
## 운영 배포 준비 문서

- [Vercel 운영 배포 가이드](docs/deployment-vercel-guide.md)
- [배포 후 Smoke Test](docs/deployment-smoke-test.md)
- [2차 최종 인수 보고서](docs/v2-final-acceptance-report.md)
- [운영 가이드](docs/operation-guide.md)
- [보안/개인정보 가이드](docs/security-and-privacy-guide.md)

운영 DB에는 `pnpm db:deploy`를 사용합니다. 운영 DB에서 `prisma migrate reset` 또는 `prisma migrate dev`를 실행하지 마세요. 실제 secret 값은 코드, 문서, git에 저장하지 말고 Vercel 환경변수로 등록합니다.

### Vercel 배포 요약

1. Managed PostgreSQL을 준비하고 `DATABASE_URL`을 Vercel production 환경변수로 등록합니다.
2. `.env.production.example` 기준으로 production 환경변수를 등록합니다.
3. `pnpm db:deploy`로 production migration을 적용합니다.
4. 최초 OWNER 초대가 필요한 경우에만 `pnpm db:seed`를 실행합니다.
5. `vercel --prod` 또는 Git 연동 production deploy를 실행합니다.
6. 배포 후 `docs/deployment-smoke-test.md`를 따라 검수합니다.

### 첨부파일 운영 제한

현재 증명자료 파일 storage adapter는 local private storage입니다. Vercel serverless 환경에서는 local filesystem을 영구 파일 저장소로 사용하지 않는 것을 권장합니다. 증명자료 파일을 실제 운영에서 사용할 경우 Vercel Blob private storage 또는 S3/GCS 같은 외부 object storage adapter 연동 후 운영하세요.
