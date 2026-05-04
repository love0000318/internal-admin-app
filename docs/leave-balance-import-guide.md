# 구성원 휴가 현황 엑셀 업로드 가이드

## 목적

OWNER가 구성원별 휴가 보유, 사용, 승인대기, 잔여 현황이 담긴 `.xlsx` 파일을 업로드해 시스템의 LeaveLedger 기준 잔여와 비교하고, 필요한 경우 차이값만 조정 이벤트로 반영합니다.

이 기능은 과거 휴가 요청 이력을 복원하거나 기존 `LeaveRequest`, `LeaveLedger`, `LeaveGrant`를 덮어쓰는 기능이 아닙니다. 잔여 휴가를 맞추기 위해 `LeaveAdjustment`와 `LeaveLedger`의 `ADJUSTED` 이벤트를 추가하는 운영 보정 기능입니다.

## 접근 권한

- OWNER: 템플릿 다운로드, 업로드, 미리보기, 최종 반영, 업로드 이력 조회, 상세 조회, 반영 취소 가능
- LEAD: 업로드 기능 접근 불가
- MANAGER: 업로드 기능 접근 불가
- EXTERNAL_PARTNER: 접근 불가

최종 반영, 잔여 차이 보정, 반영 취소는 Step-up 재인증이 필요합니다.

## 엑셀 템플릿 다운로드

경로: `/admin/leaves/import`

상단의 `엑셀 템플릿 다운로드` 버튼을 누르면 현재 ACTIVE 내부 직원 기준의 `leave-balance-import-template.xlsx` 파일을 받을 수 있습니다.

템플릿에는 다음 컬럼이 포함됩니다.

| 컬럼 | 설명 |
|---|---|
| 직원명 | 시스템 직원명 |
| 이메일 | 직원 매칭용 이메일 |
| 사번 | 직원 매칭용 사번 |
| 팀 | 소속 팀 |
| 기준연도 | 기본값은 현재 연도 |
| 총 부여 연차 | 현재 LeaveLedger 기준 참고값 |
| 사용 연차 | 현재 LeaveLedger 기준 참고값 |
| 승인대기 연차 | 현재 LeaveLedger 기준 참고값 |
| 잔여 연차 | 현재 LeaveLedger 기준 참고값 |
| 조정 메모 | OWNER 검수용 메모 |

템플릿에는 주민등록번호, 계좌번호, 주소, 급여, 가족정보, 증명자료 내용 같은 민감정보를 포함하지 않습니다. 비활성/삭제 직원은 기본 템플릿에서 제외합니다.

템플릿에는 `업로드 안내` 시트도 포함됩니다. 이 시트에는 필수 컬럼, 직원 매칭 우선순위, 0.5일 단위 입력, 민감정보 금지, 미리보기 확인 절차가 적혀 있습니다.

## 지원 파일과 컬럼

지원 파일은 `.xlsx`입니다. 기본 최대 크기는 `MAX_LEAVE_IMPORT_FILE_SIZE_MB` 환경변수로 조정하며 기본값은 10MB입니다.

주요 컬럼 alias:

| 의미 | 지원 컬럼명 |
|---|---|
| 직원명 | 직원명, 이름, 성명, 구성원명, employeeName |
| 이메일 | 이메일, 회사이메일, 개인이메일, email |
| 전화번호 | 전화번호, 휴대폰, 휴대전화, phone |
| 사번 | 사번, 직원번호, employeeNumber |
| 팀 | 팀, 조직, team |
| 기준연도 | 기준연도, 연도, year |
| 총 부여 | 총부여, 총 부여, 부여연차, 발생연차, 기본부여, granted, grantedDays |
| 사용 | 사용, 사용연차, 사용일수, used, usedDays |
| 승인대기 | 승인대기, 대기, pending, pendingDays |
| 잔여 | 잔여, 잔여연차, 남은연차, remaining, remainingDays |
| 조정 | 조정, adjustment, adjustedDays |

기존 월별 연차 사용 내역 파일의 `1월`부터 `12월` 컬럼도 함께 파싱할 수 있습니다.

## 직원 매칭 방식

업로드 row는 ACTIVE 내부 직원과 다음 순서로 매칭됩니다.

1. 사번
2. 이메일
3. 전화번호 정규화 값
4. 이름 + 팀
5. 이름

동명이인이 있거나 매칭 후보가 여러 명이면 자동 반영하지 않고 확인 필요로 표시합니다. 비활성/삭제 직원은 기본 반영 대상에서 제외합니다.

## 검증 규칙

- 직원 매칭이 없으면 오류
- 잔여 연차가 없으면 오류
- 총 부여, 사용, 승인대기, 잔여는 숫자여야 함
- 잔여는 음수 불가
- 조정값은 음수 가능
- 휴가 수량은 0.5일 단위 권장
- 잔여가 총 부여보다 크면 오류
- 사용이 총 부여보다 크면 경고
- 같은 직원과 기준연도 조합이 중복되면 오류
- 오류 row는 최종 반영 불가
- 경고 row는 OWNER가 미리보기에서 확인 후 반영 가능

## 반영 방식

시스템 잔여는 LeaveLedger 기준으로 계산합니다.

```txt
조정값 = 엑셀 잔여 연차 - 시스템 잔여 연차
```

조정값이 0이면 별도 조정 이벤트를 만들지 않습니다. 차이가 있으면 다음 기록을 생성합니다.

- `LeaveAdjustment`
- `LeaveLedger` `ADJUSTED`
- idempotency key: `leave-import-monthly:{batchId}:{rowId}`
- AuditLog: 업로드, 파싱, 검증, 반영 요약

## 업로드 이력과 상세

`/admin/leaves/import`에서 최근 업로드 이력을 확인할 수 있습니다.

이력에는 업로드 일시, 파일명, 유형, 상태, row 수, 매칭 수, 경고/오류 수, 업로드 관리자, 취소 일시가 표시됩니다.

배치 상세 `/admin/leaves/import/[batchId]`에서는 다음을 확인합니다.

- 배치 요약
- 업로드/반영/취소 관리자
- 반영 상태
- 행별 검증 결과
- 반영 후 생성된 LeaveRequest/LeaveLedger/LeaveAdjustment 수
- 월별 잔여 reconciliation 결과
- 반영 취소 가능 여부

## 반영 취소와 역조정

잘못 반영한 월별 휴가 현황 batch는 삭제하지 않고 역조정으로 취소합니다.

정책:

- `APPLIED` 상태의 월별 휴가 현황 batch만 취소 가능
- 이미 `REVERSED`인 batch는 다시 취소할 수 없음
- OWNER만 가능
- Step-up 재인증 필요
- 기존 `LeaveAdjustment`, `LeaveLedger`, `LeaveRequest`는 삭제하지 않음
- 원래 조정값의 반대 방향 `LeaveAdjustment`와 `LeaveLedger ADJUSTED` 이벤트 생성
- reverse ledger source: `IMPORT_REVERSE_ADJUSTMENT`
- reverse idempotency key: `reverse-leave-import:{batchId}:{userId}:{year}:{rowId}`

예시:

| 원래 반영 | 취소 시 역조정 |
|---|---|
| +2일 | -2일 |
| -1.5일 | +1.5일 |

휴가 사용 상세 import로 생성된 LeaveRequest의 자동 취소는 이번 운영 보조 기능 범위에서 제공하지 않습니다. 필요한 경우 별도 reverse 정책을 설계해야 합니다.

## 운영 절차

1. OWNER로 로그인합니다.
2. `/admin/leaves/import`에서 엑셀 템플릿을 다운로드합니다.
3. 템플릿의 직원 매칭 정보와 잔여 연차를 확인하고 필요한 값을 수정합니다.
4. `.xlsx` 파일을 업로드합니다.
5. 미리보기에서 직원 매칭, 오류/경고, 시스템 잔여와 엑셀 잔여 차이를 확인합니다.
6. 오류 row를 해결합니다.
7. Step-up 재인증 후 최종 반영합니다.
8. batch 상세에서 반영 결과와 reconciliation을 확인합니다.
9. 잘못 반영한 경우 APPLIED 월별 batch 상세에서 Step-up 후 `업로드 반영 취소`를 실행합니다.
10. AuditLog에 민감정보가 아닌 요약만 남았는지 확인합니다.

## 보안 주의

- 엑셀 원본은 public 폴더에 저장하지 않습니다.
- 실제 개인정보가 들어간 엑셀 파일은 GitHub에 커밋하지 않습니다.
- AuditLog에는 엑셀 row 원문 전체, token, secret, 주민등록번호, 계좌번호, fileKey를 저장하지 않습니다.
- 운영 DB에는 `prisma migrate deploy`만 사용하고 `migrate reset`은 절대 사용하지 않습니다.

## 배포 전/후 운영 확인

- `MAX_LEAVE_IMPORT_FILE_SIZE_MB`가 없으면 기본 10MB 제한으로 운영합니다.
- 운영 DB에 import 관련 migration이 아직 적용되지 않았다면 `prisma migrate deploy`로만 적용합니다.
- 실제 개인정보가 포함된 엑셀 파일은 GitHub, public 폴더, 문서에 넣지 않습니다.
- 업로드는 즉시 반영되지 않으며 OWNER가 미리보기와 검증 결과를 확인한 뒤 Step-up 재인증 후 반영합니다.
- 반영 취소는 삭제가 아니라 역조정입니다. 기존 조정/장부/요청 기록을 삭제하지 않고 반대 방향 LeaveAdjustment와 LeaveLedger 이벤트를 추가합니다.
- 배포 후 smoke test는 `docs/leave-balance-import-post-deploy-smoke-test.md`를 사용합니다.
