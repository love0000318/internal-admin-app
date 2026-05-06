# 운영자 명령 치트시트

## 검증

```powershell
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd db:validate
```

## cleanup dry-run

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
pnpm.cmd jobs:cleanup-operational-data -- --dry-run
pnpm.cmd jobs:cleanup-operational-data -- --dry-run --only=sessions
pnpm.cmd jobs:cleanup-operational-data -- --dry-run --only=notifications
pnpm.cmd jobs:cleanup-operational-data -- --dry-run --only=job-runs
```

## cleanup apply

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
$env:CONFIRM_OPERATIONAL_CLEANUP='true'
pnpm.cmd jobs:cleanup-operational-data -- --apply
```

## 금지 명령

```powershell
pnpm.cmd prisma migrate reset
pnpm.cmd prisma migrate dev
```

production DB에는 migration이 필요한 경우 `migrate deploy`만 사용한다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
pnpm.cmd prisma migrate deploy
```

## 주의

- 실제 DATABASE_URL 값을 문서나 이슈에 적지 않는다.
- cleanup apply 전 dry-run 결과와 승인 체크리스트를 확인한다.
- LeaveRequest, LeaveLedger, LeaveGrant, LeaveAdjustment, AttendanceRecord는 삭제하지 않는다.
