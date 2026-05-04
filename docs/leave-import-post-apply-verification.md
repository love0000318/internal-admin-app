# 휴가 Import 반영 후 정합성 검증 보고서 템플릿

이 문서는 실제 운영 반영 후 OWNER 또는 운영 담당자가 작성하는 검증 보고서 템플릿입니다. 실제 개인정보, 엑셀 원문, token, secret, DB URL은 기록하지 않습니다.

## 기본 정보

- 반영 batch ID:
- import 유형:
- 업로드 파일명:
- 반영 일시:
- 반영자:
- 검증자:
- 검증 일시:

## Batch Summary

| 항목 | 값 |
|---|---:|
| 총 row 수 |  |
| 반영 row 수 |  |
| skip row 수 |  |
| 실패 row 수 |  |
| 경고 row 수 |  |
| 오류 row 수 |  |
| 생성/연결 LeaveRequest 수 |  |
| 생성 LeaveLedger 수 |  |
| 생성 LeaveAdjustment 수 |  |

## 직원별 잔여 연차 비교

| 직원 | 엑셀 잔여 연차 | 시스템 잔여 연차 | 차이 | 상태 | 비고 |
|---|---:|---:|---:|---|---|
| 예: 홍길동 | 9.5 | 9.5 | 0 | 정상 |  |

## 승인대기/사용완료/조정 수량 확인

| 직원 | 승인대기 | 사용완료 | 조정 수량 | 소멸 수량 | 맞춤휴가 잔여 | 생일 반차 잔여 | 확인 결과 |
|---|---:|---:|---:|---:|---:|---:|---|
| 예: 홍길동 | 0 | 0 | 0 | 0 | 0 | 0 | 정상 |

## 확인 필요 row

| row 번호 | 직원 | 사유 | 처리 방안 | 담당자 | 상태 |
|---:|---|---|---|---|---|
|  |  | 미매칭 / UNKNOWN / 중복 의심 / 기타 |  |  |  |

## AuditLog 확인

- [ ] `LEAVE_IMPORT_FILE_UPLOADED` 기록 확인
- [ ] `LEAVE_IMPORT_PARSED` 기록 확인
- [ ] `LEAVE_IMPORT_VALIDATED` 기록 확인
- [ ] `LEAVE_IMPORT_APPLY_STARTED` 기록 확인
- [ ] `LEAVE_IMPORT_APPLY_COMPLETED` 기록 확인
- [ ] AuditLog metadata에 엑셀 row 원문 전체가 없음
- [ ] AuditLog metadata에 주민등록번호, 계좌번호, token, secret이 없음

## 최종 정합성 판단

다음 중 하나를 선택합니다.

- [ ] 정상
- [ ] 제한적으로 정상, 수동 확인 필요 row 있음
- [ ] 정합성 문제 있음, 운영 보정 필요

## 후속 조치

- 조치 내용:
- 담당자:
- 완료 예정일:
- 완료 여부:

## 차이 보정 확인

- [ ] 차이가 있는 직원의 원인 후보를 확인했다.
- [ ] 보정이 필요한 경우 OWNER Step-up 후 `차이값으로 보정`을 실행했다.
- [ ] 보정은 직접 DB 수정이 아니라 LeaveAdjustment와 LeaveLedger `ADJUSTED` 이벤트로 기록되었다.
- [ ] 같은 batch/year/userId에 중복 보정이 생성되지 않았다.
- [ ] 보정 후 reconciliation 상태를 다시 확인했다.
- [ ] `LEAVE_IMPORT_RECONCILIATION_ADJUSTMENT_CREATED` AuditLog를 확인했다.
