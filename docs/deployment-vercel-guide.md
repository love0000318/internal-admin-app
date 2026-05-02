# Vercel 운영 배포 가이드

이 문서는 2차 고도화 버전을 Vercel + Managed PostgreSQL 환경에 배포하기 위한 운영 절차입니다. 실제 secret 값은 문서나 코드에 저장하지 말고 Vercel 환경변수로 등록합니다.

## 배포 전 준비

1. GitHub 저장소가 최신 main 브랜치를 가리키는지 확인합니다.
2. Managed PostgreSQL 인스턴스를 준비합니다.
3. 운영 DB 백업 정책을 정합니다.
4. `.env.production.example` 기준으로 Vercel production 환경변수를 등록합니다.
5. 운영 DB에서는 `migrate reset`과 `migrate dev`를 사용하지 않습니다.

## Vercel 프로젝트 생성

1. Vercel Dashboard에서 새 Project를 생성합니다.
2. GitHub 저장소를 연결합니다.
3. Framework preset은 Next.js로 둡니다.
4. Build command는 기본값 `pnpm build`를 사용합니다.
5. Install command는 `pnpm install`을 사용합니다.

## 필수 환경변수

Production 환경에 다음 값을 등록합니다.

- `DATABASE_URL`
- `APP_BASE_URL`
- `NODE_ENV=production`
- `APP_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_SECRET`
- `TOKEN_SECRET`
- `INVITATION_TOKEN_SECRET`
- `CRON_SECRET`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_NAME`
- `SEED_OWNER_TITLE`
- `INVITATION_EXPIRES_IN_DAYS=7`
- `SESSION_EXPIRES_IN_DAYS=14`
- `MAX_LEAVE_ATTACHMENT_SIZE_MB=10`
- `LEAVE_ATTACHMENT_STORAGE=local`
- `PRIVATE_UPLOAD_DIR=private/uploads`

`APP_SECRET`, `SESSION_SECRET`, `ENCRYPTION_SECRET`, `TOKEN_SECRET`, `INVITATION_TOKEN_SECRET`, `CRON_SECRET`은 모두 서로 다른 긴 랜덤 문자열이어야 합니다.

## 파일 첨부 Storage 주의사항

현재 구현된 저장소 adapter는 local private storage입니다.

Vercel serverless 환경에서는 local filesystem이 영구 파일 저장소가 아니므로, 증명자료 파일을 운영에서 실제로 사용할 경우 Vercel Blob private storage 또는 S3/GCS 같은 외부 object storage 연동이 필요합니다. 이 항목은 운영 전 P1 제한 사항입니다.

향후 Vercel Blob을 붙일 경우 필요한 환경변수 후보:

- `BLOB_READ_WRITE_TOKEN`
- `LEAVE_ATTACHMENT_STORAGE=vercel-blob`

단, 현재 코드에는 Vercel Blob adapter가 아직 연결되어 있지 않으므로 값을 바꾸기 전에 adapter 구현과 smoke test가 필요합니다.

## Prisma Production Migration

운영 DB에는 다음 명령을 사용합니다.

```bash
pnpm db:deploy
```

직접 실행한다면:

```bash
pnpm prisma migrate deploy
```

주의:

- 운영 DB에서 `prisma migrate reset` 금지
- 운영 DB에서 `prisma migrate dev` 금지
- migration 전 DB 백업 권장
- production `DATABASE_URL` 기준으로 실행

## Production Seed

최초 OWNER 초대가 필요한 경우에만 실행합니다.

```bash
pnpm db:seed
```

seed는 기본 휴가 정책, 휴가 유형, 연차 정책, 승인 정책, 생일 반차 정책, OWNER 초대 invitation을 확인합니다. 기존 OWNER invitation이 있으면 중복 생성하지 않습니다.

OWNER 초대 URL은 최초 생성 시 콘솔에 한 번만 출력됩니다. 초대 token 원문은 DB에 저장되지 않습니다.

## 배포 명령

Vercel CLI 인증이 된 운영자가 실행합니다.

```bash
npm install -g vercel
vercel login
vercel link
vercel --prod
```

CI에서 prebuilt deploy를 사용할 경우:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

## Cron 설정

`vercel.json`에 다음 cron이 등록되어 있습니다.

- `/api/cron/auto-confirm-past-start-leaves`
- schedule: `10 15 * * *`

Vercel Cron은 UTC 기준입니다. `15:10 UTC`는 Asia/Seoul 기준 00:10입니다.

cron endpoint는 `CRON_SECRET`으로 보호됩니다. 운영 환경에서 `CRON_SECRET`이 없으면 실행되지 않아야 합니다.

## 배포 후 smoke test

`docs/deployment-smoke-test.md`를 따라 확인합니다.

최소 확인:

1. 배포 URL 접속
2. OWNER 가입 또는 로그인
3. 대시보드 접근
4. 직원 초대와 가입
5. 휴가 요청과 승인
6. 자동 확정 Job dry-run
7. 리포트 CSV export
8. 권한 차단
9. AuditLog와 JobRun 확인

## Rollback

문제가 있으면 Vercel Dashboard 또는 CLI에서 직전 정상 production deployment로 rollback합니다.

```bash
vercel rollback
```

DB migration이 이미 적용된 경우에는 rollback 전후 DB 호환성을 별도로 확인합니다. 운영 DB를 임의로 reset하지 않습니다.

## 운영 전 체크리스트

- [ ] `pnpm lint` 통과
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm test` 통과
- [ ] `pnpm build` 통과
- [ ] `pnpm db:validate` 통과
- [ ] `pnpm db:generate` 통과
- [ ] `pnpm preflight` 통과
- [ ] `pnpm leave:ledger:validate` 통과
- [ ] production 환경변수 등록
- [ ] `CRON_SECRET` 등록
- [ ] 운영 DB migration deploy
- [ ] 최초 OWNER seed 필요 여부 확인
- [ ] 첨부파일 storage 운영 방침 확인
