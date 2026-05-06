# 월간 유지보수 Runbook

## 사전 확인

- production 배포 상태 확인
- 최근 P0/P1 incident 확인
- DB migration pending 여부 확인
- secret/token 노출 이슈 없음 확인
- 휴가 계산 regression test 통과 여부 확인

## cleanup dry-run

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
pnpm.cmd jobs:cleanup-operational-data -- --dry-run
```

필요 시 범위를 좁힌다.

```powershell
pnpm.cmd jobs:cleanup-operational-data -- --dry-run --only=sessions
pnpm.cmd jobs:cleanup-operational-data -- --dry-run --only=notifications
pnpm.cmd jobs:cleanup-operational-data -- --dry-run --only=job-runs
```

## 승인 기준

- LeaveRequest, LeaveLedger, LeaveGrant, LeaveAdjustment, AttendanceRecord가 대상이 아님
- AuditLog 삭제가 포함되지 않음
- HIGH/CRITICAL 또는 보안 관련 Notification 정리 대상이 아님
- candidate count가 평소보다 과도하지 않음
- OWNER 승인 기록이 있음

## apply

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
$env:CONFIRM_OPERATIONAL_CLEANUP='true'
pnpm.cmd jobs:cleanup-operational-data -- --apply
```

dry-run 없이 apply하지 않는다.

## 사후 확인

- 로그인
- 내 휴가 현황
- 구성원 휴가 현황
- 알림센터
- 관리자 작업 이력
- AuditLog 조회
- health endpoint

문제가 있으면 cleanup 재실행보다 원인 기능을 먼저 확인한다.
