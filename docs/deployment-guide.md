# 배포 가이드

이 문서는 회사 내부 관리 앱 MVP를 운영 환경에 배포하기 위한 절차입니다.

## 1. 배포 전 준비사항

- 운영 도메인 또는 접속 URL
- 운영 PostgreSQL 데이터베이스
- `.env.production.example` 기준의 환경변수
- 배포 전 DB 백업 정책
- OWNER로 사용할 대표 이메일, 이름, 직급
- 배포 후 smoke test를 수행할 대표/직원 테스트 계정 정보

## 2. 추천 배포 방식

### 1순위: Vercel + Managed PostgreSQL

Next.js App Router 프로젝트이므로 가장 단순한 운영 방식입니다. Vercel에 앱을 배포하고, DB는 Supabase, Neon, Railway, Render PostgreSQL 같은 managed PostgreSQL을 사용합니다.

장점:

- Next.js 배포가 가장 쉽습니다.
- HTTPS와 preview deployment가 자동화됩니다.
- 서버 운영 부담이 작습니다.

주의:

- Prisma migration과 seed는 배포 후 별도 명령으로 실행해야 합니다.
- `APP_BASE_URL`은 실제 Vercel 도메인 또는 회사 도메인으로 설정해야 합니다.

### 2순위: Docker + VPS 또는 회사 내부 서버

회사 서버에서 앱과 DB를 직접 운영할 때 적합합니다. 이 레포에는 `Dockerfile`과 `docker-compose.example.yml`이 포함되어 있습니다.

장점:

- 서버와 DB를 직접 통제할 수 있습니다.
- 비용과 네트워크 구성을 회사 정책에 맞출 수 있습니다.

주의:

- OS 보안 업데이트, 백업, 로그, 장애 대응을 직접 운영해야 합니다.
- HTTPS reverse proxy 구성이 별도로 필요합니다.

### 3순위: Render/Railway/Fly.io 같은 PaaS

Vercel보다 서버 제어가 필요하지만 VPS 운영은 부담스러운 경우 선택합니다.

## 3. 운영 DB 준비

Managed PostgreSQL을 만들고 connection string을 확보합니다.

예시:

```text
postgresql://USER:PASSWORD@HOST:5432/internal_ops_mvp?schema=public
```

운영 migration 전에는 반드시 백업을 먼저 수행합니다.

## 4. 환경변수 설정

`.env.production.example`을 기준으로 배포 플랫폼에 환경변수를 등록합니다.

필수:

- `DATABASE_URL`
- `APP_BASE_URL`
- `NODE_ENV=production`
- `APP_SECRET`
- `SESSION_SECRET`
- `TOKEN_SECRET`
- `INVITATION_TOKEN_SECRET`
- `INVITATION_EXPIRES_IN_DAYS`
- `SESSION_EXPIRES_IN_DAYS`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_NAME`
- `SEED_OWNER_TITLE`

secret 값은 32자 이상의 랜덤 문자열을 사용합니다. 실제 secret은 Git에 저장하지 않습니다.

## 5. Production build

```bash
pnpm install
pnpm db:generate
pnpm build
```

## 6. Prisma migration

개발 환경:

```bash
pnpm db:migrate
```

운영 환경:

```bash
pnpm db:deploy
pnpm db:generate
```

운영 DB에 migration을 적용하기 전에는 백업을 먼저 수행합니다.

## 7. Seed 실행

최초 배포 후:

```bash
pnpm db:seed
```

seed는 기본 LeavePolicy와 OWNER invitation을 생성합니다. 초대 token 원문은 콘솔에 한 번만 출력되고 DB에는 token hash만 저장됩니다.

## 8. OWNER 초대 URL 확인

seed 출력 예:

```text
Owner invitation URL:
https://your-domain.com/invitations/accept?token=...
```

이 URL은 안전하게 대표에게 전달합니다. 유출되면 기존 PENDING 초대를 취소하고 새 초대를 발급해야 합니다.

## 9. Vercel 배포 예시

1. GitHub repository를 Vercel에 연결합니다.
2. Install command: `corepack pnpm install --frozen-lockfile`
3. Build command: `corepack pnpm build`
4. 환경변수에 production 값을 등록합니다.
5. managed PostgreSQL의 `DATABASE_URL`을 등록합니다.
6. 최초 deploy를 실행합니다.
7. 배포 후 Vercel command 또는 로컬 운영 터미널에서 `pnpm db:deploy`를 실행합니다.
8. `pnpm db:seed`를 실행해 OWNER 초대 URL을 확인합니다.
9. `APP_BASE_URL`이 실제 도메인인지 확인합니다.
10. smoke test를 수행합니다.

## 10. Docker/VPS 배포 예시

개발용 compose 예시는 다음과 같습니다.

```bash
docker compose -f docker-compose.example.yml up -d postgres
docker compose -f docker-compose.example.yml build app
docker compose -f docker-compose.example.yml run --rm app pnpm db:deploy
docker compose -f docker-compose.example.yml run --rm app pnpm db:seed
docker compose -f docker-compose.example.yml up -d app
```

운영에서는 `docker-compose.example.yml`의 secret과 도메인을 그대로 사용하지 말고 회사 환경에 맞게 별도 compose 파일 또는 secret manager를 사용하세요.

## 11. Smoke test

배포 후 [smoke-test.md](smoke-test.md)를 따라 확인합니다.

핵심:

- `/api/health` 응답
- OWNER 가입과 로그인
- 팀 생성
- 직원 초대/가입
- 휴가 요청
- 휴가 승인
- 감사 로그 조회

## 12. Rollback 기본 원칙

- 앱 배포 실패: 이전 애플리케이션 버전으로 되돌립니다.
- migration 실패: DB 백업에서 복구하는 것을 우선 검토합니다.
- OWNER 접근 불가: DB를 직접 수정하지 말고 개발자 확인 후 복구 절차를 진행합니다.

## 13. 배포 후 확인해야 할 로그

- Next.js server error
- Prisma migration 결과
- seed 실행 결과
- 로그인 실패 급증 여부
- AuditLog 기록 여부

## 14. 운영 중 주의사항

- raw invite token은 다시 조회할 수 없습니다.
- production에서 mock 본인인증을 사용하면 안 됩니다.
- AuditLog는 운영 감사 자료이므로 임의 삭제하지 않습니다.
- 직원 삭제는 hard delete가 아니라 비활성화로 처리합니다.
