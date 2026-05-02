# 지금 바로 실행하기

대표 또는 운영자가 로컬에서 1차 MVP를 실행해 OWNER 계정을 만들고 첫 설정을 진행하는 순서입니다.

## 1. 프로젝트 폴더로 이동

```bash
cd C:\Users\love0\Documents\Codex\2026-05-01\1-mvp-mvp-1-2-3
```

다른 위치에 받았다면 해당 프로젝트 폴더로 이동하세요.

## 2. 패키지 설치

이 프로젝트는 `pnpm`을 사용합니다.

```bash
pnpm install
```

## 3. `.env` 생성

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

이미 `.env`가 있다면 덮어쓰기 전에 내용을 확인하세요.

## 4. `.env` 필수값 입력

로컬 예시:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/internal_ops_mvp?schema=public"
APP_BASE_URL="http://localhost:3000"
NODE_ENV="development"
APP_SECRET="replace-with-at-least-32-random-characters"
SESSION_SECRET="replace-with-at-least-32-random-characters"
TOKEN_SECRET="replace-with-at-least-32-random-characters"
INVITATION_TOKEN_SECRET="replace-with-at-least-32-random-characters"
INVITATION_EXPIRES_IN_DAYS="14"
SESSION_EXPIRES_IN_DAYS="7"
IDENTITY_VERIFICATION_PROVIDER="mock"
SEED_OWNER_EMAIL="jack@curinginnos.com"
SEED_OWNER_NAME="권예찬"
SEED_OWNER_TITLE="대표"
```

운영에서는 secret 값을 반드시 긴 랜덤 문자열로 교체하고 `NODE_ENV=production`을 사용합니다.

## 5. PostgreSQL 실행

Docker가 설치되어 있다면:

```bash
docker run --name internal-admin-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=internal_ops_mvp \
  -p 5432:5432 \
  -d postgres:16
```

이미 컨테이너가 있다면:

```bash
docker start internal-admin-postgres
```

Docker를 쓰지 않는 경우 PostgreSQL 16 이상을 설치하고 `internal_ops_mvp` 데이터베이스를 생성하세요.

## 6. Prisma generate

```bash
pnpm db:generate
```

## 7. Migration 실행

로컬 개발:

```bash
pnpm db:migrate
```

운영 배포:

```bash
pnpm db:deploy
```

## 8. Seed 실행

```bash
pnpm db:seed
```

정상 실행되면 다음과 같은 OWNER 초대 URL이 출력됩니다.

```text
========================================
Owner invitation URL
http://localhost:3000/invitations/accept?token=xxxx
========================================
이 링크로 접속해 대표 계정을 생성하세요.
가입이 완료되면 이 링크는 다시 사용할 수 없습니다.
```

초대 token 원문은 DB에 저장되지 않습니다. 링크를 분실하면 기존 초대를 취소하고 새로 발급해야 합니다.

## 9. 개발 서버 실행

```bash
pnpm dev
```

기본 접속 주소:

```text
http://localhost:3000
```

포트 3000이 이미 사용 중이면 Next.js가 3001 같은 다른 포트를 안내할 수 있습니다.

## 10. OWNER 초대 URL 접속

브라우저에서 seed가 출력한 OWNER 초대 URL을 엽니다.

## 11. 대표 계정 생성

입력할 값:

- 이름: `권예찬`
- 전화번호: 사용할 대표 전화번호
- 비밀번호: 영문, 숫자, 특수문자를 포함한 8자 이상
- 비밀번호 확인
- 개발 환경 mock 인증

가입 완료 후 `/dashboard`로 이동하는지 확인합니다.

## 12. 로그인 후 첫 설정

대표가 처음 해야 할 일:

1. 조직/팀 생성
2. 직원 초대
3. 직원 가입 확인
4. 휴가 정책 확인
5. 회사 휴일 등록
6. 직원 휴가 요청 테스트
7. OWNER 휴가 승인 테스트
8. 감사 로그 확인

## 13. 문제 발생 시 먼저 확인할 것

- DB 연결 실패: PostgreSQL이 실행 중인지 확인
- seed 실패: migration이 적용되었는지 확인
- 로그인 실패: 전화번호와 사용자 상태가 ACTIVE인지 확인
- 초대 링크 실패: token 만료, ACCEPTED/CANCELLED 상태 여부 확인
- 권한 오류: 사용자 role과 팀 리드 지정 여부 확인
