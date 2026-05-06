# cleanup apply 승인 체크리스트

apply 전 아래 항목을 모두 확인한다.

- [ ] dry-run 결과를 확인했다.
- [ ] OWNER가 apply를 승인했다.
- [ ] 대상은 운영성 데이터로 제한된다.
- [ ] LeaveRequest 삭제가 없다.
- [ ] LeaveLedger 삭제가 없다.
- [ ] LeaveGrant 삭제가 없다.
- [ ] LeaveAdjustment 삭제가 없다.
- [ ] AttendanceRecord 삭제가 없다.
- [ ] AuditLog 무조건 삭제가 없다.
- [ ] HIGH/CRITICAL 알림 정리가 없다.
- [ ] token, password, secret, `DATABASE_URL` 출력이 없다.
- [ ] apply 명령에 `CONFIRM_OPERATIONAL_CLEANUP=true`가 있다.

승인 후 명령:

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
$env:CONFIRM_OPERATIONAL_CLEANUP='true'
pnpm.cmd jobs:cleanup-operational-data -- --apply
```

apply 후 smoke test:

- [ ] 로그인
- [ ] 알림센터
- [ ] 관리자 작업 이력
- [ ] 내 휴가 현황
- [ ] 구성원 휴가 현황
- [ ] AuditLog 조회
