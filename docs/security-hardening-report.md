# 보안 강화 보고서

## 적용한 보안 강화

- AuditLog metadata sanitize 강화
- AuditLog category/severity 분류 추가
- AuditLog update/delete 앱 레벨 차단
- OWNER 전용 AuditLog 필터 화면 강화
- AuditLog CSV export Step-up 재인증 적용
- OWNER 전용 보안 대시보드 추가
- 운영 접근 통제 문서 보완

## AuditLog sanitize

다음 값은 AuditLog metadata 저장 시 `[REDACTED]` 처리됩니다.

- password, passwordHash
- token, tokenHash, session token
- invitation token, short token
- verification code, codeHash
- resident id, bank account
- fileKey, private path
- DATABASE_URL, SESSION_SECRET, ENCRYPTION_SECRET, TOKEN_SECRET, CRON_SECRET
- cookie, authorization header

## AuditLog 조회/export 권한

- 조회: OWNER 전용
- export: OWNER + Step-up 재인증 필요
- export 감사: `AUDIT_LOG_EXPORTED`

## 보안 대시보드

`/admin/security`에서 CRITICAL/HIGH 이벤트, 로그인 차단, 권한 변경, 초대 재발급, CSV export, 첨부 다운로드, Job 실패를 확인할 수 있습니다.

## 내부자 위험 한계

앱 내부 권한 체계는 production DB, Vercel 환경변수, GitHub 배포 권한을 가진 내부자의 모든 행위를 완전히 막을 수 없습니다. 앱 보안과 별도로 인프라 접근권한 통제, PR review, secret rotation, DB 직접 접속 제한, AuditLog 정기 검토가 필요합니다.

## 남은 보안 TODO

- AuditLog hash chain 검토
- CRITICAL 이벤트 OWNER 알림 자동 생성 고도화
- 세션 강제 revoke 관리 화면
- OWNER 권한 부여 2인 승인
- 보안 대시보드 기간/사용자 필터 고도화
