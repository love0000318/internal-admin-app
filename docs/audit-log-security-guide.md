# AuditLog 보안 가이드

## 목적

AuditLog는 로그인, 초대, 권한 변경, 휴가 승인, 리포트 export, Job 실행 같은 운영 이벤트를 추적하기 위한 보안 감사 기록입니다.

## 원칙

- AuditLog는 앱 UI에서 삭제하거나 수정하지 않습니다.
- AuditLog metadata에는 비밀번호, token, tokenHash, codeHash, secret, 주민등록번호, 계좌번호, fileKey, private path를 저장하지 않습니다.
- 모든 AuditLog metadata는 저장 직전에 sanitize됩니다.
- OWNER만 AuditLog를 조회할 수 있습니다.
- AuditLog CSV export는 OWNER 권한과 Step-up 재인증이 필요합니다.
- CSV export에는 metadata 전체가 아니라 sanitize된 요약만 포함합니다.

## 분류

AuditLog는 `category`와 `severity`로 분류됩니다.

Category:

- `AUTH`
- `INVITATION`
- `HR`
- `LEAVE`
- `ATTENDANCE`
- `SECURITY`
- `REPORT`
- `JOB`
- `FILE`
- `POLICY`
- `GENERAL`

Severity:

- `INFO`
- `WARNING`
- `HIGH`
- `CRITICAL`

OWNER 권한 부여/제거, 마지막 OWNER 보호, CSRF 차단, 보안 설정 변경은 `CRITICAL`로 분류됩니다.

## Export

AuditLog export는 보안상 고위험 작업입니다.

1. OWNER가 `/admin/audit-logs`에 접근합니다.
2. 현재 비밀번호로 Step-up 재인증을 수행합니다.
3. 제한 시간 안에 CSV export를 실행합니다.
4. export 결과 자체는 AuditLog에 `AUDIT_LOG_EXPORTED`로 기록됩니다.

## 무결성 한계

앱은 AuditLog update/delete를 Prisma client 레벨에서 차단합니다. 다만 production DB 관리자 권한을 가진 내부자는 DB를 직접 수정할 수 있으므로, 인프라 접근권한 통제와 정기 감사가 반드시 필요합니다.
