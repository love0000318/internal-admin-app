# 휴가 Import 장애 대응 Runbook

휴가 import 중 오류나 정합성 문제가 발생했을 때 사용하는 운영 대응 절차입니다.

## 공통 원칙

- 운영 DB에서 직접 수정하지 않습니다.
- 운영 DB에서 `migrate reset`을 절대 사용하지 않습니다.
- 같은 batch를 임의로 재반영하지 않습니다.
- 개발자에게 전달할 때는 batchId, row 번호, 오류 메시지만 전달합니다.
- 실제 엑셀 원본 파일은 공유하지 않습니다.
- 개인정보, token, secret, DB URL을 메신저나 문서에 기록하지 않습니다.

## 반영 중 오류 발생

확인:

- batch 상태
- applied row 수
- 실패 row 수
- 오류 메시지
- `LEAVE_IMPORT_APPLY_FAILED` AuditLog

조치:

1. 동일 batch 재반영을 시도하지 않습니다.
2. batch 상세 화면에서 실패 row와 오류를 확인합니다.
3. 오류 row가 파일 문제인지, 매핑 문제인지, 시스템 문제인지 분류합니다.
4. 파일 또는 매핑 문제라면 새 파일 또는 수동 매핑 후 새 batch로 다시 업로드합니다.
5. 시스템 문제라면 개발자에게 batchId와 오류 메시지만 전달합니다.

## 잔여 연차가 이상한 경우

확인:

- 해당 직원의 LeaveLedger
- import batch row
- 기존 휴가 요청 중복 여부
- 월별 잔여 조정 이벤트
- 상세 사용 내역 반영 순서

조치:

1. 상세 파일이 먼저 반영되었는지 확인합니다.
2. 월별 잔여 조정이 상세 반영 후 수행되었는지 확인합니다.
3. 동일 기간 휴가가 중복 생성되었는지 확인합니다.
4. 필요하면 별도 LeaveAdjustment로 수동 보정합니다.
5. 보정 사유는 AuditLog에 남깁니다.

## 중복 차감 의심

확인:

- 동일 직원, 동일 기간, 동일 휴가 유형 LeaveRequest
- `LeaveLedger.idempotencyKey`
- 같은 batch 재반영 여부
- 같은 row applied 여부
- LeaveLedger 중복 event 여부

조치:

1. batch 재반영 여부를 먼저 확인합니다.
2. 중복 LeaveRequest가 import로 생성된 것인지 기존 요청인지 확인합니다.
3. 중복 차감 ledger가 있으면 운영 보정 절차로 반대 조정을 생성합니다.
4. 관련 row와 ledger ID를 검증 보고서에 기록합니다.

## UNKNOWN row가 섞인 경우

확인:

- UNKNOWN row가 반영되었는지 확인합니다.
- 해당 row의 상태 원문을 확인합니다.
- 증명자료만 있고 상태가 공란인지 확인합니다.

조치:

1. UNKNOWN row는 자동 반영되지 않아야 합니다.
2. 반영 전에 발견되면 상태를 명확히 매핑하거나 제외합니다.
3. 이미 잘못 반영되었다면 생성된 LeaveRequest와 LeaveLedger를 batch 기준으로 확인하고 수동 보정합니다.

## 취소 휴가가 차감된 경우

확인:

- mappedStatus가 `CANCELLED`였는지 확인합니다.
- `LeaveLedger USED`가 생성되었는지 확인합니다.
- 기존 시스템 요청과 중복된 것인지 확인합니다.

조치:

1. 취소 row는 사용량으로 차감되지 않아야 합니다.
2. 잘못 차감된 ledger가 있으면 반대 조정 이벤트로 보정합니다.
3. 관련 batchId와 row 번호를 기록합니다.

## 잘못 반영한 경우

현재 자동 rollback은 기본 운영 절차가 아닙니다.

조치:

1. batch 상세에서 생성된 LeaveRequest, LeaveLedger, LeaveAdjustment ID를 확인합니다.
2. 운영 담당자와 개발자가 반영 범위를 확정합니다.
3. 필요한 경우 LeaveAdjustment로 반대 조정을 생성합니다.
4. imported LeaveRequest는 운영 정책에 따라 취소 또는 별도 표시합니다.
5. 모든 조치는 AuditLog에 기록합니다.

## 잔여 차이 보정이 필요한 경우

확인:

- 엑셀 잔여 연차
- 시스템 잔여 연차
- 차이값
- 동일 batch/year/userId의 기존 reconciliation adjustment 여부
- 중복 LeaveRequest 또는 LeaveLedger 여부

조치:

1. 차이 원인을 먼저 분류합니다.
2. 중복 차감이 원인이면 자동 삭제하지 않고 운영 보정으로 처리합니다.
3. OWNER가 Step-up 재인증 후 `차이값으로 보정`을 실행합니다.
4. 보정은 LeaveAdjustment와 LeaveLedger `ADJUSTED` 이벤트로 기록되어야 합니다.
5. 보정 후 reconciliation을 다시 확인합니다.

## 보안 사고가 의심되는 경우

확인:

- OWNER 외 계정 접근 여부
- Step-up 없이 apply가 되었는지 여부
- AuditLog metadata에 민감정보가 저장되었는지 여부
- public 경로에 파일이 저장되었는지 여부

조치:

1. 해당 계정의 세션을 revoke합니다.
2. OWNER 비밀번호를 변경합니다.
3. Vercel, Neon, GitHub 접근권한을 확인합니다.
4. 필요한 경우 secret rotation 절차를 실행합니다.
5. 보안 대시보드와 AuditLog를 보존합니다.
