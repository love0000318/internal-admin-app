# 데이터 보존 정책

## 원칙

- 핵심 업무 기록은 삭제하지 않는다.
- 운영성 데이터 정리는 dry-run으로 후보를 확인한 뒤 승인된 경우에만 apply한다.
- secret, token, password, `DATABASE_URL` 값은 문서와 로그에 기록하지 않는다.
- 운영 DB에서 `prisma migrate reset`과 production DB 대상 `prisma migrate dev`는 사용하지 않는다.

## 삭제 금지 데이터

다음 데이터는 cleanup 대상이 아니다.

- `LeaveRequest`
- `LeaveLedger`
- `LeaveGrant`
- `LeaveAdjustment`
- `AttendanceRecord`
- `AttendanceMonthlyClose`
- 직원 핵심 인사 데이터
- 고위험 AuditLog
- 보안 이벤트 AuditLog
- OWNER, ROLE, PASSWORD, STEP_UP, EXPORT 관련 AuditLog

## 운영성 데이터 보존 기준

| 대상 | 기본 보존 기준 | 처리 |
| --- | ---: | --- |
| 만료 Session | 만료 후 30일 | 삭제 후보 |
| revoked Session | revoke 후 30일 | 삭제 후보 |
| 수락/만료/취소 Invitation | 90일 | 미수락 terminal 상태만 삭제 후보 |
| VerificationCode | 사용/만료/폐기 후 30일 | hash 필드 제거 후보 |
| 읽은 LOW/NORMAL Notification | 180일 | 삭제 후보 |
| HIGH Notification | 최소 1년 | 기본 cleanup 제외 |
| 성공/부분 성공 JobRun | 90일 | 삭제 후보 |
| 실패 JobRun | 최소 180일 | 삭제 후보 |
| stale import preview | 90일 | 미반영 batch만 삭제 후보 |
| 임시 파일 | 7~30일 | dry-run 후보 확인 |

## 운영 명령

dry-run:

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
pnpm.cmd jobs:cleanup-operational-data -- --dry-run
```

apply:

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
$env:CONFIRM_OPERATIONAL_CLEANUP='true'
pnpm.cmd jobs:cleanup-operational-data -- --apply
```

apply 전에 dry-run 결과와 승인 기록을 확인한다.
