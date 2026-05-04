# 휴가 Import 반영 후 정합성 검증과 차이 보정 가이드

## 목적

휴가 엑셀 import 반영 후 직원별 휴가 잔여와 사용 내역이 정확한지 확인하고, 엑셀 잔여 연차와 시스템 잔여 연차 사이에 차이가 있는 경우 안전하게 보정하기 위한 운영 가이드입니다.

보정은 직접 DB 수정이나 기존 LeaveLedger 삭제로 처리하지 않습니다. 반드시 LeaveAdjustment와 LeaveLedger `ADJUSTED` 이벤트로 기록합니다.

## 검증 대상

APPLIED 상태의 LeaveImportBatch를 기준으로 확인합니다.

확인 항목:

- batchId
- importType
- originalFileName
- uploadedByUserId
- appliedByUserId
- appliedAt
- rowCount
- applied row count
- skipped row count
- warning/error count
- 직원별 엑셀 잔여 연차
- 직원별 시스템 잔여 연차
- 차이값
- 승인대기/사용완료/조정/소멸 수량

## 비교 방식

월별 연차 사용 내역 batch의 `remainingAnnualDays`와 시스템 ledger 기준 잔여 연차를 비교합니다.

```txt
차이 = 엑셀 잔여 연차 - 시스템 잔여 연차
```

예:

- 엑셀 잔여: 9.5일
- 시스템 잔여: 10.5일
- 차이: -1.0일
- 보정 예정 수량: -1.0일

차이가 0이면 정상입니다. 차이가 0.5 이하라도 반차 단위일 수 있으므로 반올림으로 숨기지 않고 그대로 표시합니다.

## 상태 분류

직원별 reconciliation 상태:

- 정상: 엑셀 잔여와 시스템 잔여가 일치
- 차이 있음: 잔여 연차 차이 발생
- 중복 의심: 동일 직원, 기간, 휴가 유형, 수량의 중복 LeaveRequest 또는 ledger 의심
- 확인 필요: UNKNOWN row, 취소 row used 처리, 승인대기 row used 처리 등 확인 필요
- 보정 완료: 해당 batch/user/year에 reconciliation 보정 ledger가 있음

## 차이 원인 후보

차이가 발생하면 다음 후보를 확인합니다.

- 상세 휴가 내역 누락
- 월별 잔여 연차 기준값 차이
- 기존 시스템 휴가와 import 휴가 중복
- 승인대기 처리 차이
- 취소 휴가 처리 차이
- 연차 조정 누락
- 입사일/연차 정책 차이
- 소멸/이월 정책 차이
- 수동 확인 필요

## 보정 원칙

보정 조건:

- OWNER만 가능
- Step-up 재인증 필요
- APPLIED 상태 batch만 가능
- 월별 연차 사용 내역 batch만 가능
- 차이값이 0이면 보정 불가
- 같은 batch/year/userId에 이미 보정 ledger가 있으면 중복 보정 불가

보정 방식:

- `LeaveAdjustment` 생성
- `LeaveLedger` `ADJUSTED` 이벤트 생성
- source: `IMPORT_RECONCILIATION_ADJUSTMENT`
- idempotencyKey: `leave-import-reconciliation:{batchId}:{userId}:{year}`
- reason: `휴가 import 반영 후 잔여 연차 보정`

metadata에는 batchId, userId, year, excelRemaining, systemRemaining, signedAmount 정도만 저장합니다. 엑셀 row 원문 전체, 주민등록번호, 계좌번호, token, secret, fileKey는 저장하지 않습니다.

## 중복 데이터 처리 원칙

중복 의심 데이터는 자동 삭제하지 않습니다.

운영자는 다음을 확인합니다.

- 중복 의심 LeaveRequest 목록
- 중복 의심 LeaveLedger 목록
- 생성된 batch/row
- 기존 시스템 요청과 import 요청의 기간/유형/수량

중복 차감이 실제로 발생했다면 기존 ledger를 삭제하지 말고 반대 방향 LeaveAdjustment/LeaveLedger 보정 이벤트로 처리합니다.

## 취소/승인대기/UNKNOWN 상태 검수

취소 row:

- 사용량으로 차감하면 안 됩니다.
- `LeaveLedger USED`가 없어야 합니다.
- 필요하면 취소 이력으로만 확인합니다.

승인대기 row:

- `LeaveRequest.status = PENDING`
- `LeaveLedger PENDING` 또는 기존 pending 구조로 반영합니다.
- usedAmount를 증가시키면 안 됩니다.

UNKNOWN row:

- 반영 제외입니다.
- OWNER가 상태를 명확히 매핑하기 전까지 자동 반영하지 않습니다.

## AuditLog 확인

확인할 action:

- `LEAVE_IMPORT_RECONCILIATION_RUN`
- `LEAVE_IMPORT_RECONCILIATION_DIFF_FOUND`
- `LEAVE_IMPORT_RECONCILIATION_ADJUSTMENT_CREATED`
- `LEAVE_IMPORT_RECONCILIATION_ADJUSTMENT_BLOCKED`

AuditLog에는 차이 요약과 보정 ID만 남겨야 하며, 엑셀 row 원문 전체나 민감정보를 저장하지 않습니다.

## 최종 반영 완료 판단

다음 조건을 만족하면 import 반영 완료로 판단할 수 있습니다.

- 차이 발생 직원이 없거나 모든 차이에 대한 원인/보정이 기록됨
- 취소 row가 사용량으로 차감되지 않음
- 승인대기 row가 used로 반영되지 않음
- UNKNOWN row가 자동 반영되지 않음
- 중복 의심 request/ledger가 운영자가 확인한 상태
- 보정 내역이 LeaveAdjustment, LeaveLedger, AuditLog에 남음
- 직원별 휴가 현황과 batch reconciliation이 일치
