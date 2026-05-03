# 세션·토큰·초대 보안 강화 보고서

## 적용 목적

세션 토큰, 초대 토큰, 단축 초대 URL, 1회용 가입 인증 코드가 탈취되거나 무차별 대입되는 위험을 낮추고, 인증 관련 고위험 이벤트가 감사 로그에 남도록 보강했다.

## 세션 보안 구조

- 세션 원문 토큰은 DB에 저장하지 않고 `tokenHash`만 저장한다.
- 세션 쿠키는 `httpOnly`, `sameSite=lax`, `path=/`를 사용하며 production에서는 `secure=true`로 설정된다.
- `Session.expiresAt`이 지난 세션, `revokedAt`이 있는 세션, 비활성 사용자 세션은 인증에서 제외한다.
- 만료 세션은 `SESSION_EXPIRED` AuditLog를 남기고 쿠키를 삭제한다.
- 로그아웃 시 현재 세션은 `revokedAt`, `revokedReason=LOGOUT`으로 폐기된다.

## 자동 로그인 보안

- 자동 로그인은 정상 로그인 성공 후 `rememberMe=true`일 때만 긴 만료 기간을 적용한다.
- 일반 로그인은 `SESSION_EXPIRES_IN_DAYS`, 자동 로그인은 `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS`를 사용한다.
- 자동 로그인 세션도 로그아웃 시 즉시 폐기된다.
- 비밀번호 없는 quick login, mock login, demo login은 production에서 허용하지 않는다.

## 로그인 실패 제한

- 전화번호 원문 대신 해시된 identifier로 `LoginAttempt`를 기록한다.
- 최근 15분 내 실패 5회 이상이면 로그인을 차단한다.
- 실패/차단 메시지는 계정 존재 여부를 노출하지 않는 문구로 통일한다.
- 성공 시 해당 identifier의 실패 기록을 정리하고 성공 기록만 남긴다.

## 초대 token 보안

- 긴 초대 token과 단축 초대 token은 원문을 DB에 저장하지 않는다.
- DB에는 각각 `tokenHash`, `shortTokenHash`만 저장한다.
- 만료, 사용 완료, 취소, 재발급된 초대는 재사용할 수 없다.
- 실패 사유는 사용자에게 자세히 노출하지 않고 `INVITATION_TOKEN_FAILED` AuditLog에 reasonCode만 남긴다.

## 1회용 가입 인증 코드 보안

- 가입 인증 코드 원문은 생성 직후 한 번만 표시하고 DB에는 `verificationCodeHash`만 저장한다.
- 실패 횟수는 `verificationCodeAttemptCount`로 누적하며 `verificationCodeMaxAttempts` 이상이면 잠긴다.
- 가입 완료 시 `verificationCodeConsumedAt`을 저장해 재사용을 막는다.
- AuditLog에는 코드 원문과 hash를 저장하지 않는다.

## secret 환경변수 검증

- preflight가 `APP_SECRET`, `SESSION_SECRET`, `TOKEN_SECRET`, `INVITATION_TOKEN_SECRET`, `INVITATION_SHORT_TOKEN_SECRET`, `INVITATION_VERIFICATION_CODE_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET` 길이를 확인한다.
- secret들이 같은 값이면 실패한다.
- secret 원문은 출력하지 않는다.

## CSRF 방어

- 기존 `assertSameOriginRequest`/`isSameOriginRequest` helper를 유지한다.
- 이번 단계에서는 인증·초대 경로의 token/hash 노출 방지와 로그인 throttling을 우선 적용했다.
- 남은 관리자 mutation 전체 적용은 후속 TODO다.

## API 응답 sanitizer

- `sanitizeUserForResponse`, `sanitizeSessionForResponse`, `sanitizeInvitationForResponse` helper를 추가했다.
- `passwordHash`, `tokenHash`, `shortTokenHash`, `verificationCodeHash`가 API 응답에 섞이지 않게 사용할 수 있다.

## 운영자가 지켜야 할 점

- 운영 DB에서는 `prisma migrate reset`을 절대 사용하지 않는다.
- DB 변경 배포 시 `pnpm prisma migrate deploy`를 사용한다.
- Vercel/Neon/GitHub secret 접근 권한자는 최소화한다.
- 초대 링크와 가입 인증 코드는 직원에게만 안전하게 전달한다.
- 가입 코드 분실 시 기존 초대 상세에서 원문을 찾지 말고 초대를 재발급한다.

## 남은 보안 TODO

- 모든 고위험 mutation에 Origin/Referer 검증 확대 적용
- 관리자용 모든 기기 로그아웃 화면
- suspicious login 탐지 고도화
- OWNER 권한 변경 2인 승인
