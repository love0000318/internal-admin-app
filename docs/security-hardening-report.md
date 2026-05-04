# 보안 강화 보고서

작성일: 2026-05-04

## 적용된 보안 강화

- session token, invitation token, shortToken, calendar subscription token은 원문을 DB에 저장하지 않고 hash 기반으로 검증한다.
- 1회용 가입 인증 코드는 hash 저장, 만료, consumed/revoked, maxAttempts 제한을 사용한다.
- 자동 로그인 유지 세션은 일반 세션과 만료 기간을 분리하고, 로그아웃 시 revoke된다.
- OWNER 권한 변경, 직원 비활성화, 직원 영구 삭제, CSV export는 Step-up 재인증을 요구한다.
- 마지막 OWNER 보호와 자기 자신 비활성화/강등 방지 정책을 유지한다.
- AuditLog metadata sanitize와 category/severity 분류가 적용되어 있다.
- AuditLog export는 OWNER + Step-up이 필요하다.
- `/admin/security` 보안 대시보드에서 고위험 이벤트를 확인한다.
- 비활성 직원 영구 삭제는 기록 유무에 따라 hard delete 또는 개인정보 익명화로 처리한다.

## 민감정보 보호 원칙

AuditLog, Notification metadata, JobRun summary, CSV export에는 다음 값을 저장하거나 노출하지 않는다.

- password, passwordHash
- session token, tokenHash
- invitation token, shortToken, verification code, codeHash
- DATABASE_URL, SESSION_SECRET, ENCRYPTION_SECRET, TOKEN_SECRET, CRON_SECRET
- 주민등록번호, 계좌번호 원문
- 첨부파일 fileKey, private path, private URL

## 릴리즈 후보 점검 결과

통과:

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm db:validate`
- `corepack pnpm db:generate`

미완료:

- 로컬 PostgreSQL 연결 실패로 `prisma migrate status`와 `preflight`는 완료하지 못했다.
- 운영 Neon DB 기준 `prisma migrate deploy`와 production smoke test가 필요하다.
- Vercel CLI가 없어 실제 production env 목록은 확인하지 못했다.

## 남은 보안 TODO

- 운영 Vercel env 이름과 적용 환경 확인.
- 운영 Neon DB migration deploy 후 preflight 재실행.
- 실제 role별 직접 접근 smoke test 수행.
- AuditLog hash chain은 후속 검토.
- SSO/MFA는 후속 검토.
- 첨부파일 운영 storage와 바이러스 검사 정책은 후속 검토.
