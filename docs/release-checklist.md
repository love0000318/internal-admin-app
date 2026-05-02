# 운영 전 최종 체크리스트

## 환경변수

- [ ] `DATABASE_URL`이 운영 PostgreSQL을 가리킨다.
- [ ] `APP_BASE_URL`이 실제 도메인으로 설정되어 있다.
- [ ] `NODE_ENV=production`이다.
- [ ] `APP_SECRET`, `SESSION_SECRET`, `TOKEN_SECRET`, `INVITATION_TOKEN_SECRET`이 32자 이상의 랜덤 값이다.
- [ ] `INVITATION_EXPIRES_IN_DAYS`가 설정되어 있다.
- [ ] `SESSION_EXPIRES_IN_DAYS`가 설정되어 있다.
- [ ] `IDENTITY_VERIFICATION_PROVIDER`가 production에서 `mock`이 아니다.
- [ ] `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_TITLE`이 최초 대표 정보와 일치한다.

## DB와 migration

- [ ] 운영 DB 백업을 완료했다.
- [ ] `pnpm db:validate`가 통과한다.
- [ ] `pnpm db:generate`가 통과한다.
- [ ] `pnpm db:deploy`로 migration을 적용했다.
- [ ] `pnpm db:status`로 migration 상태를 확인했다.
- [ ] 기본 LeavePolicy가 생성되어 있다.

## Seed와 OWNER

- [ ] `pnpm db:seed`를 실행했다.
- [ ] OWNER 초대 URL을 안전하게 보관했다.
- [ ] OWNER 계정 생성을 완료했다.
- [ ] seed 재실행 시 OWNER 초대가 중복 생성되지 않는다.

## 보안

- [ ] production cookie가 httpOnly, secure, sameSite lax 이상이다.
- [ ] session token 원문은 DB에 저장되지 않는다.
- [ ] invitation token 원문은 DB에 저장되지 않는다.
- [ ] 비밀번호 원문은 DB에 저장되지 않는다.
- [ ] production mock 본인인증 provider가 차단된다.
- [ ] AuditLog 화면에서 민감정보가 마스킹된다.
- [ ] 오류 화면에 stack trace가 노출되지 않는다.

## 기능 확인

- [ ] 로그인 가능
- [ ] 직원 초대 가능
- [ ] 직원 가입 가능
- [ ] 휴가 요청 가능
- [ ] 휴가 승인 가능
- [ ] 휴가 반려 가능
- [ ] 승인된 휴가 취소 가능
- [ ] 감사 로그 조회 가능

## 권한 확인

- [ ] MANAGER는 조직 관리에 접근할 수 없다.
- [ ] MANAGER는 휴가 승인에 접근할 수 없다.
- [ ] LEAD는 휴가 설정에 접근할 수 없다.
- [ ] LEAD는 담당 팀 밖 요청을 처리할 수 없다.
- [ ] 비로그인 사용자는 `/dashboard`에 접근할 수 없다.

## 테스트와 빌드

- [ ] `pnpm lint` 통과
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm test` 통과
- [ ] `pnpm build` 통과
- [ ] `pnpm preflight` 통과

## 문서

- [ ] README 확인
- [ ] 배포 가이드 확인
- [ ] 운영 가이드 확인
- [ ] 백업/복구 가이드 확인
- [ ] smoke test 문서 확인
