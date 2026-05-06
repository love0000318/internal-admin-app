# 비용 증가 경고 체크리스트

## Neon PostgreSQL

- [ ] row count가 갑자기 증가했다.
- [ ] Session이 사용자 수 대비 과도하다.
- [ ] Notification이 장기간 읽은 상태로 누적되어 있다.
- [ ] JobRun 실패가 반복된다.
- [ ] import preview batch가 방치되어 있다.

## Vercel

- [ ] build 시간이 증가했다.
- [ ] function invocation이 평소보다 많다.
- [ ] cron/job endpoint가 반복 실패한다.
- [ ] report/export route 호출량이 급증했다.

## 대응

1. 원인 route/job을 확인한다.
2. 실패 JobRun과 AuditLog를 확인한다.
3. cleanup dry-run으로 운영성 데이터 후보만 확인한다.
4. OWNER 승인 후 apply 여부를 결정한다.

cleanup은 원인 해결을 대체하지 않는다.
