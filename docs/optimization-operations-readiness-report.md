# 최적화/cleanup 운영 준비 보고서

## 준비 상태

- cleanup script: 준비됨
- package script: `jobs:cleanup-operational-data`
- dry-run 기본값: 적용됨
- apply 확인 env: `CONFIRM_OPERATIONAL_CLEANUP=true`
- 핵심 업무 기록 보호: 적용됨
- Prisma schema 변경: 없음
- migration: 없음

## 정리 대상

- 만료/오래된 revoked Session
- 오래된 terminal Invitation
- 오래된 VerificationCode hash
- 오래된 읽은 LOW/NORMAL Notification
- 오래된 성공/부분 성공 JobRun
- 오래된 미반영 import preview batch
- 파일 cleanup은 현재 inspect-only

## 제외 대상

- LeaveRequest
- LeaveLedger
- LeaveGrant
- LeaveAdjustment
- AttendanceRecord
- AttendanceMonthlyClose
- AuditLog 전체 삭제

## 운영 절차

1. `pnpm.cmd jobs:cleanup-operational-data -- --dry-run`
2. 후보 count 검토
3. 승인 체크리스트 확인
4. OWNER 승인
5. `CONFIRM_OPERATIONAL_CLEANUP=true`로 apply
6. smoke test

## 남은 TODO

- 실제 파일 저장소 구조가 확정되면 orphan temp file inspect 로직을 구체화한다.
- 대량 화면 pagination은 각 화면별 사용량을 보고 점진 적용한다.
