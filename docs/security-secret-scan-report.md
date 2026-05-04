# Secret/Token 노출 및 권한 탈취 점검 보고서

## 1. 점검 목적

외부 해킹, token/secret 노출, 관리자 권한 탈취 가능성을 배포 전 기준으로 점검했습니다. 실제 secret 값, DB URL, token 원문은 이 보고서에 기록하지 않습니다.

## 2. 점검 범위

- 코드: `src`, `scripts`, `prisma`, `tests`
- 문서: `README.md`, `AGENTS.md`, `docs/**`
- 설정: `.env.example`, `.env.production.example`, `.gitignore`, Git tracked files
- 보안 흐름: session, invitation, short invitation, verification code, calendar subscription, AuditLog, JobRun, Notification, CSV export, OWNER/Step-up 권한

## 3. 검색한 secret 패턴

다음 패턴을 원문 출력 없이 파일/라인/패턴 중심으로 검색했습니다.

- `postgresql://`, `postgres://`, `neondb_owner`
- `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_SECRET`, `APP_SECRET`
- `TOKEN_SECRET`, `INVITATION_TOKEN_SECRET`, `CRON_SECRET`
- `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`
- `VERCEL_TOKEN`, `GITHUB_TOKEN`, `API_KEY`, `SECRET`, `PASSWORD`, `PRIVATE_KEY`
- `bearer`, `Authorization`, `webhook`, `token=`, `invitations/accept?token=`, `/i/`
- `sslmode=require`, `channel_binding=require`

`rg`는 현재 환경에서 접근 거부가 발생해 PowerShell `Select-String` 기반 스캐너로 대체했습니다.

## 4. 코드 내 발견 사항

실제 운영 secret 값으로 판단되는 하드코딩 값은 발견하지 못했습니다.

확인된 값은 다음 유형입니다.

- `.env.example`, `.env.production.example`의 placeholder
- 문서의 환경변수 이름 또는 placeholder
- 테스트/CI용 로컬 DB 예시
- 개발 전용 fallback secret 문자열
- 초대 링크/토큰 출력 절차 안내 문구

조치:

- `.gitignore`에 `*.key`, `service-account*.json`, `credentials*.json`를 추가했습니다.
- calendar subscription token secret이 production에서 누락되면 명시적으로 실패하도록 보강했습니다.

## 5. Git tracked 파일 점검

다음 패턴의 tracked 파일 포함 여부를 확인했습니다.

- `.env`, `.env.local`, `.env.production`
- `.vercel/`
- `private/`, `private/imports/`
- `*.xlsx`, `*.xls`, `*.csv`
- `*.pem`, `*.key`
- `service-account*.json`, `credentials*.json`

결과:

- 실제 `.env` 파일 추적 없음
- private/imports 추적 없음
- 엑셀/CSV fixture 추적 없음
- key/pem/credential JSON 추적 없음

`.env.example`과 `.env.production.example`은 placeholder 용도로 의도적으로 추적합니다.

## 6. Git history 점검 방법

이번 점검에서는 원문 patch를 출력하지 않고 commit count만 확인했습니다.

실행한 안전 점검:

```powershell
git log --all --format='%h' -S"postgresql://"
git log --all --format='%h' -S"neondb_owner"
git log --all --format='%h' -S"SESSION_SECRET"
git log --all --format='%h' -S"INVITATION_TOKEN_SECRET"
git log --all --format='%h' -S"RESEND_API_KEY"
git log --all --format='%h' -S"SLACK_WEBHOOK_URL"
```

결과:

- 위 패턴의 history commit count는 0으로 확인했습니다.

운영 전 추가 권장:

```powershell
gitleaks detect --source . --redact
trufflehog git file://. --only-verified
```

도구 실행 결과에 실제 secret이 표시될 수 있으므로 공유 전 반드시 redact해야 합니다.

## 7. token 원문 저장 점검

Prisma schema와 helper를 확인했습니다.

- Session: `tokenHash` 저장, cookie에만 raw session token 사용
- Invitation: `tokenHash`, `shortTokenHash`, `verificationCodeHash` 저장
- CalendarSubscriptionToken: `tokenHash` 저장
- Password: `passwordHash`만 저장

AuditLog sanitizer와 API sanitizer는 password/token/hash/secret 계열 key를 제거 또는 redaction 처리합니다.

주의:

- OWNER seed/reissue script는 초대 URL과 인증 코드를 생성 직후 1회 출력합니다. 이는 의도된 bootstrap 흐름이지만 production 로그에 남으면 노출 사고로 간주하고 재발급/rotation해야 합니다.

## 8. OWNER 권한 탈취 가능성 점검

확인 결과:

- 직원 role/status 변경: `requireOwner`, high-risk 변경 Step-up, 마지막 OWNER/자기 자신 보호 helper 확인
- 직원 영구 삭제/익명화: `requireOwner`, `EMPLOYEE_PERMANENT_DELETE` Step-up 확인
- 초대 재발급: `requireOwner`, `INVITATION_REISSUE` Step-up 확인
- 리포트 export/AuditLog export: `assertRecentStepUp` 확인
- 보안 대시보드: `requireOwner` 확인
- cron route: `assertCronRequestAuthorized` 확인
- 휴가 import 반영/반영 취소: `requireOwner`, helper 내부 `assertRecentStepUp` 확인

UI 메뉴 숨김만이 아니라 server action/route에서 guard가 확인되었습니다.

## 9. CSRF/XSS/CSV Injection 점검

- CSV export sanitizer: `src/lib/reports/csv.ts`에서 `=`, `+`, `-`, `@` prefix escape 확인
- AuditLog/Notification/JobRun sanitizer: secret-like value redaction 확인
- cron route: bearer/header secret 검증 확인
- `dangerouslySetInnerHTML`: 검색 범위에서 운영 화면 사용은 확인되지 않았습니다.

P1:

- 모든 mutation server action에 same-origin 검증이 일괄 적용되어 있는지는 추가 점검이 필요합니다. 현재는 request 기반 route helper가 있으나 server action 전반 적용은 후속 보강 대상으로 남깁니다.

## 10. P0/P1/P2 결과

### P0

없음.

### P1

- production에서 seed/reissue script의 1회용 초대 URL/인증 코드 출력이 로그에 남을 수 있음
- server action 전체에 대한 same-origin/CSRF 적용 범위 추가 점검 필요
- GitHub secret scanning/push protection 활성 여부는 로컬 코드만으로 확인 불가

### P2

- gitleaks/trufflehog 자동화 미구현
- secret rotation 훈련 자동화 미구현
- 운영 보안 대시보드에 secret scan 결과 연동 미구현

## 11. 즉시 조치 항목

- `.gitignore` 보강 완료
- calendar subscription token secret production guard 보강 완료
- 운영 전 GitHub secret scanning, push protection, branch protection 활성 여부 확인 필요

## 12. secret rotation 필요 여부

현재 로컬 코드/문서/tracked 파일 점검 기준 즉시 rotation이 필요한 실제 secret 노출은 확인하지 못했습니다.

단, 운영 로그 또는 GitHub/Vercel/Neon 외부 관리 화면에서 실제 secret 노출이 발견되면 삭제가 아니라 즉시 rotation해야 합니다.

## 13. 남은 TODO

- GitHub Advanced Security 또는 secret scanning 설정 확인
- gitleaks/trufflehog를 CI에 추가
- server action mutation의 CSRF 적용 범위 표준화
- seed/reissue script 실행 로그 보관 정책 수립
