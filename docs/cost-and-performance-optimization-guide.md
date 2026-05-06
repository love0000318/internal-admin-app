# 비용 및 성능 최적화 가이드

## 점검 대상

- Neon PostgreSQL row 증가량
- Vercel build/runtime 사용량
- JobRun 실패 반복
- Notification 누적량
- AuditLog 고위험 이벤트 증가
- import preview batch 방치
- 만료 Session 누적

## 최적화 원칙

- 대량 목록은 서버에서 필터링하고 page size를 제한한다.
- 클라이언트에 전체 데이터를 내려 필터링하지 않는다.
- cleanup은 운영성 데이터만 대상으로 한다.
- LeaveRequest, LeaveLedger, LeaveGrant, LeaveAdjustment, AttendanceRecord는 cleanup 대상이 아니다.
- JobRun과 Notification은 보존 정책에 따라 오래된 일반 기록만 정리한다.

## 월간 권장 절차

1. production health 확인
2. Neon storage 증가 추세 확인
3. Vercel usage 증가 추세 확인
4. cleanup dry-run 실행
5. 후보 count 검토
6. OWNER 승인 후 apply 여부 결정
7. apply 후 smoke test 실행

## 비용 증가 징후

- JobRun이 같은 오류로 반복 실패
- unread Notification이 비정상적으로 누적
- import preview batch가 장기간 방치
- Session row가 로그인 사용자 수 대비 과도하게 증가
- AuditLog export 또는 report route가 반복 호출

이상 징후가 있으면 원인 기능을 먼저 수정하고, cleanup으로 증상만 숨기지 않는다.
