# cleanup dry-run 해석 가이드

`jobs:cleanup-operational-data -- --dry-run`은 DB를 변경하지 않고 후보 수만 출력한다.

## 출력 항목

- `target`: 정리 대상 종류
- `action`: delete, update, inspect-only
- `retentionDays`: 적용된 보존 기간
- `candidateCount`: 후보 row 수
- `affectedCount`: dry-run에서는 항상 0
- `warnings`: 수동 확인이 필요한 안내

## 정상 예

```json
{
  "dryRun": true,
  "applied": false,
  "items": [
    {
      "target": "sessions",
      "action": "delete",
      "retentionDays": 30,
      "candidateCount": 12,
      "affectedCount": 0
    }
  ]
}
```

## REVIEW_REQUIRED

다음 상황은 apply하지 않고 원인을 확인한다.

- 후보 count가 평소보다 급증
- `files` target warning이 있음
- 정리 대상에 핵심 업무 기록이 포함된 것처럼 보임
- 실패 JobRun 후보가 많음
- 알림 후보가 사용자 공지 이슈와 관련되어 있음

## 금지

- dry-run 없이 apply 금지
- 출력에 secret/token이 보이면 즉시 중단
- LeaveLedger/LeaveRequest/AttendanceRecord 삭제 시도 금지
