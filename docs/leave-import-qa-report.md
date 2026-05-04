# 휴가 Import QA Report

## QA 목적

휴가 엑셀 업로드 기능이 실제 운영에서 사용할 수 있는지 배포 전 기준으로 검수했습니다. 검수 범위는 업로드, 파싱, 미리보기, 직원 매칭, 휴가 유형 매핑, 상태 매핑, validation, Step-up 후 최종 반영, 반영 후 정합성 확인, 권한과 AuditLog 안전장치입니다.

이 문서는 실제 개인정보가 포함된 운영 엑셀 파일을 저장하지 않습니다.

## 지원 파일 유형

### 월별 연차 사용 내역

지원 구조:

- 시트명 권장: `월별 연차 사용 내역`
- 필수 컬럼: 이름, 사번, 입사일, 잔여 연차, 1월~12월

검수 결과:

- header row 감지 지원: 통과
- 직원 매칭 preview: 통과
- 입사일 파싱: 통과
- 잔여 연차 숫자 파싱: 통과
- 월별 사용량 파싱: 통과
- 엑셀 잔여와 시스템 잔여 비교: 통과
- 차이값 기반 ADJUSTED 예정값 표시: 통과
- 차이 0 row 조정 생략: 통과

### 휴가 사용 상세 내역

지원 구조:

- 필수 컬럼: 사번, 이름, 회사내이름, 조직, 휴가 시작일, 휴가 종료일, 항목, 사용시간(일), 사용시간(시간), 상태, 증명자료

검수 결과:

- 안내문 row 뒤 header row 자동 탐색: 통과
- Excel serial date 변환: 통과
- 문자열 날짜 변환: 통과
- 직원 매칭 preview: 통과
- 휴가 유형 매핑 preview: 통과
- 상태 매핑 preview: 통과
- UNKNOWN 상태 row 차단: 통과
- 중복 의심 row 경고: 통과
- 취소 row 사용량 차감 제외: 통과
- 승인대기 row pending 반영 방식: 통과
- 승인완료 row used 반영 방식: 통과

## 리허설 시나리오 결과

### 시나리오 A: 월별 연차 사용 내역

검수 항목:

- OWNER 전용 업로드 화면 확인
- 파일 파싱 후 batch 생성 확인
- rowCount, matched, unmatched, warning, error 수 표시 확인
- 미매칭 row 반영 차단 확인
- 엑셀 잔여와 시스템 잔여 차이 표시 확인
- Step-up 없는 apply 실패 로직 확인
- Step-up 후 apply 로직 확인
- LeaveAdjustment와 LeaveLedger ADJUSTED 생성 경로 확인
- batch 재반영 차단 확인
- AuditLog 기록 경로 확인

판정: 코드 및 자동 테스트 기준 통과. 실제 운영 DB에 대한 최종 apply 리허설은 운영 OWNER 계정과 실제 Step-up 환경에서 별도 수행 필요.

### 시나리오 B: 휴가 사용 상세 내역

검수 항목:

- header row 자동 감지 확인
- Excel serial date 변환 확인
- 직원 매칭 결과 표시 확인
- 휴가 유형 매핑 결과 표시 확인
- 상태 매핑 결과 표시 확인
- UNKNOWN row 반영 차단 확인
- CANCELLED row used ledger 미생성 확인
- PENDING row pending ledger 생성 경로 확인
- APPROVED row used ledger 생성 경로 확인
- 중복 의심 row skip 경로 확인
- Step-up 없는 apply 실패 로직 확인
- batch 재반영 차단 확인
- AuditLog 기록 경로 확인

판정: 코드 및 자동 테스트 기준 통과. 실제 운영 파일은 개인정보 보호 정책에 따라 repo에 저장하지 않았으며, 운영 반영 전 preview-only 리허설을 권장.

## Validation 보강 상태

서버 validation에서 차단하는 항목:

- matchedUserId 없는 row
- 상세 row의 mappedLeaveTypeId 누락
- UNKNOWN 상태 row
- amountDays 0 이하
- 시작일이 종료일보다 늦은 row
- 이미 applied인 row
- 같은 idempotencyKey의 LeaveLedger가 존재하는 row

서버 validation에서 경고 또는 제외하는 항목:

- 동일 직원, 동일 기간, 동일 휴가 유형, 동일 수량의 기존 LeaveRequest
- CANCELLED row
- 월별 파일의 잔여 차이 0 row

## 정합성 검증 결과

반영 후 확인 가능한 항목:

- 엑셀 잔여 연차
- 시스템 ledger 기준 잔여 연차
- 잔여 차이
- 승인대기 수량
- 사용 완료 수량
- 조정 수량
- 생성된 LeaveRequest 수
- 생성된 LeaveLedger 수
- 생성된 LeaveAdjustment 수

판정:

- 월별 파일은 차이값만 조정하는 구조로 중복 조정 위험을 낮췄습니다.
- 상세 파일은 상태별 ledger event를 분리해 취소 휴가가 사용량으로 차감되지 않도록 했습니다.
- batch와 row 단위 applied 추적, ledger idempotencyKey로 재반영을 차단합니다.

## 권한과 Step-up 검증 결과

확인 항목:

- OWNER만 `/admin/leaves/import` 접근 가능
- OWNER만 upload 가능
- OWNER만 validation/apply 가능
- 최종 apply는 Step-up 재인증 필요
- LEAD, MANAGER, EXTERNAL_PARTNER는 접근 및 반영 불가

판정: 코드 경로 기준 통과.

## AuditLog 검증 결과

기록되는 주요 action:

- `LEAVE_IMPORT_FILE_UPLOADED`
- `LEAVE_IMPORT_PARSED`
- `LEAVE_IMPORT_VALIDATED`
- `LEAVE_IMPORT_VALIDATION_RUN`
- `LEAVE_IMPORT_APPLY_STARTED`
- `LEAVE_IMPORT_BLOCKED`
- `LEAVE_IMPORT_APPLY_FAILED`
- `LEAVE_IMPORT_APPLY_COMPLETED`
- `LEAVE_IMPORT_APPLIED`
- `LEAVE_IMPORT_ROW_MANUALLY_MATCHED`

민감정보 보호:

- 파일 원문은 저장하지 않습니다.
- AuditLog metadata에는 batchId, rowCount, warning/error count 등 요약만 저장합니다.
- 주민등록번호, 계좌번호, token, secret, 파일 원문은 저장하지 않습니다.

## 모바일 UI 검증 결과

확인 항목:

- summary card 표시
- 검증 결과 카드 표시
- row별 오류와 경고 확인
- manual mapping form 표시
- Step-up 안내와 최종 반영 버튼 위치

판정: 모바일 카드 목록과 데스크톱 테이블 패턴이 적용되어 있습니다. 실제 운영 파일처럼 row가 많은 경우에는 필터와 pagination 추가가 P1 개선 후보입니다.

## P0 Blocker

현재 코드/자동 테스트 기준 발견된 P0 blocker는 없습니다.

## P1 개선 항목

- 실제 운영 파일 preview-only 리허설을 OWNER 계정으로 1회 수행 필요
- row 수가 많은 batch의 미리보기 필터와 검색 UX 강화
- 자동 rollback은 미지원이므로 수동 보정 절차 숙지 필요
- 실제 운영 DB에서 migration deploy 전 `prisma migrate status` 확인 필요

## P2 후속 항목

- Import batch soft reverse 자동화
- 휴가 유형 매핑 preset 관리자 UI
- 대용량 파일 async processing
- import 전용 샘플 템플릿 다운로드
- row별 상세 감사 화면 고도화

## 실행한 명령

아래 명령을 배포 전 검증 대상으로 실행합니다.

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm db:validate`
- `corepack pnpm db:generate`

운영 DB 적용에는 `prisma migrate deploy`만 사용해야 하며, `migrate reset`은 금지입니다.

## 배포 가능 여부

판정: 제한적으로 운영 반영 가능

조건:

- 운영 DB migration 상태를 확인하고 필요한 migration을 deploy합니다.
- 실제 운영 엑셀 파일은 먼저 preview-only로 업로드해 미매칭, UNKNOWN, 중복 의심 row를 제거합니다.
- 최종 apply는 OWNER Step-up 후 소규모 범위부터 진행합니다.
- 반영 후 직원별 휴가 현황 reconciliation을 확인합니다.

## 실제 운영 반영 가능 여부

판정: 제한적으로 운영 반영 가능

월별 파일은 차이값 조정 방식이므로 preview에서 차이를 검토한 뒤 반영할 수 있습니다. 상세 파일은 UNKNOWN, CANCELLED, duplicate row 처리가 안전하게 분리되어 있으나 실제 원본의 상태값 편차가 있을 수 있으므로 첫 운영 반영은 테스트 직원 또는 소수 직원 범위로 진행하는 것을 권장합니다.
