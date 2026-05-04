# 휴가 사용내역 엑셀 Import 가이드

## 목적

OWNER가 외부 엑셀 파일의 휴가 사용내역과 잔여 연차를 업로드해 시스템의 직원별 휴가 현황에 반영하기 위한 운영 절차입니다.

업로드 파일은 즉시 반영되지 않습니다. 서버에서 먼저 파싱하고, 직원 매칭, 휴가 유형 매핑, 상태 매핑, 오류와 경고를 미리보기로 확인한 뒤 Step-up 재인증 후 최종 반영합니다.

## 지원 파일 유형

### 월별 연차 사용 내역

권장 시트명은 `월별 연차 사용 내역`입니다.

필수 컬럼:

- 이름
- 사번
- 입사일
- 잔여 연차
- 1월 ~ 12월

반영 방식:

- 엑셀의 `잔여 연차`와 시스템의 연차 잔여를 비교합니다.
- 차이가 있는 직원만 `LeaveAdjustment`와 `LeaveLedger ADJUSTED` 이벤트로 보정합니다.
- 차이가 0인 row는 불필요한 조정 이벤트를 만들지 않습니다.
- ledger source는 `IMPORT_MONTHLY_ANNUAL_USAGE`로 기록됩니다.

### 휴가 사용 상세 내역

필수 컬럼:

- 사번
- 이름
- 회사내이름
- 조직
- 휴가 시작일
- 휴가 종료일
- 항목
- 사용시간(일)
- 사용시간(시간)
- 상태
- 증명자료

파일 앞쪽에 안내문 row가 있어도 실제 header row를 자동 탐색합니다.

반영 방식:

- `APPROVED` row는 imported `LeaveRequest`와 `LeaveLedger USED`로 반영합니다.
- `PENDING` row는 imported `LeaveRequest`와 `LeaveLedger PENDING`으로 반영합니다.
- `CANCELLED` row는 사용량으로 차감하지 않습니다.
- `UNKNOWN` row는 자동 반영하지 않고 검토 대상으로 차단합니다.

## 직원 매칭 기준

우선순위:

1. 사번이 `EmployeeProfile.employeeNumber` 또는 사용자 사번과 일치
2. 회사내이름이 프로필 표시명, 법적 이름, 사용자 이름과 일치
3. 이름이 사용자 이름 또는 프로필 이름과 일치
4. 이름과 조직명이 함께 일치

매칭 결과가 없거나 여러 명이면 최종 반영할 수 없습니다. 미리보기 화면에서 row별로 사용자를 수동 지정해야 합니다.

## 휴가 유형 매핑

기본 매핑:

- 연차 -> `ANNUAL`
- 반차 -> `HALF_DAY`
- 생일 반차 -> `BIRTHDAY_HALF_DAY`
- 포상 -> `REWARD`
- 예비군 훈련 -> `RESERVE_FORCES`
- 민방위 휴가 -> `CIVIL_DEFENSE`

시스템에 해당 휴가 유형이 없으면 자동 생성하지 않습니다. 먼저 휴가 유형을 생성하거나 미리보기에서 매핑을 보정한 뒤 반영합니다.

## 상태 매핑

기본 매핑:

- 승인대기 -> `PENDING`
- 승인완료, 사용완료 -> `APPROVED`
- 휴가취소 -> `CANCELLED`
- 공란 또는 판단 불가 -> `UNKNOWN`

증명자료만 있고 상태가 공란인 row는 안전하게 `UNKNOWN`으로 처리합니다. 운영자가 확인하기 전에는 승인 완료로 간주하지 않습니다.

## 미리보기 검증 기준

최종 반영 전 서버에서 다음을 검증합니다.

- matchedUserId가 없는 row는 반영 불가
- 상세 파일에서 mappedLeaveTypeId가 없는 row는 반영 불가
- mappedStatus가 `UNKNOWN`이면 반영 불가
- amountDays가 0 이하이면 반영 불가
- 시작일이 종료일보다 늦으면 반영 불가
- 이미 applied인 row는 재반영 불가
- 같은 idempotencyKey의 `LeaveLedger`가 있으면 재반영 불가
- 동일 직원, 동일 기간, 동일 휴가 유형, 동일 수량의 기존 `LeaveRequest`가 있으면 중복 의심 경고

## 상태별 반영

- `APPROVED`: imported LeaveRequest를 만들고 `LeaveLedger USED`를 생성합니다.
- `PENDING`: imported LeaveRequest를 만들고 `LeaveLedger PENDING`을 생성합니다.
- `CANCELLED`: 사용량 ledger를 만들지 않습니다.
- `UNKNOWN`: 최종 반영을 차단합니다.

## 중복 방지

- batch와 row 단위로 applied 상태를 저장합니다.
- `LeaveLedger.idempotencyKey`를 `leave-import-monthly:{batchId}:{rowId}` 또는 `leave-import-detail:{batchId}:{rowId}` 형태로 생성합니다.
- 같은 batch는 두 번 반영할 수 없습니다.
- 같은 row는 두 번 반영할 수 없습니다.
- 중복 의심 상세 row는 기본적으로 skip 또는 검토 대상으로 처리합니다.

## 반영 후 확인

반영 완료 후 batch 상세 화면에서 다음을 확인합니다.

- 반영 완료 row 수
- 생성 또는 연결된 LeaveRequest 수
- 생성된 LeaveLedger 수
- 생성된 LeaveAdjustment 수
- 건너뛴 row와 실패 row 수
- 월별 파일의 경우 직원별 엑셀 잔여와 시스템 ledger 잔여 차이

차이가 남는 직원은 수동 확인 또는 별도 조정이 필요합니다.

## 보안 주의사항

- OWNER만 업로드와 미리보기를 사용할 수 있습니다.
- 최종 반영에는 Step-up 재인증이 필요합니다.
- 엑셀 원본 파일은 public에 저장하지 않습니다.
- 실제 개인정보가 들어간 엑셀 파일을 GitHub에 올리지 않습니다.
- AuditLog에는 파일 원문, row 전체, 주민등록번호, 계좌번호, token, secret을 저장하지 않습니다.
- 운영 DB에서 `migrate reset`은 절대 사용하지 않습니다.

## Rollback 제한

자동 rollback은 현재 운영 기본 절차가 아닙니다. Import batch에는 생성된 LeaveRequest, LeaveLedger, LeaveAdjustment ID가 추적되므로 문제가 발생하면 해당 batch 기준으로 운영자가 확인 후 별도 보정합니다.

대량 반영 전에는 반드시 preview, 오류 row, UNKNOWN row, 중복 의심 row, 반영 예정 수량을 확인하세요.

## 실제 운영 반영 문서

실제 production 데이터 반영 시에는 다음 문서를 함께 사용합니다.

- [실제 운영 반영 전 체크리스트](./leave-import-live-apply-checklist.md)
- [실제 운영 반영 Runbook](./leave-import-live-apply-runbook.md)
- [반영 후 정합성 검증 템플릿](./leave-import-post-apply-verification.md)
- [반영 후 정합성 검증과 차이 보정 가이드](./leave-import-reconciliation-guide.md)
- [Import 장애 대응 Runbook](./leave-import-incident-runbook.md)
- [실제 운영 반영 Readiness Report](./leave-import-live-readiness-report.md)
