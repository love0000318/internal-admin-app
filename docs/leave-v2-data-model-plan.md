# 2차 휴가 고도화 데이터 모델 설계 초안

이 문서는 설계 초안이다. 현재 단계에서 Prisma schema를 변경하거나 migration을 생성하지 않는다.

## 1. 현재 1차 MVP 모델 요약

현재 휴가 모델은 다음 구조다.

- `LeaveType`: enum. `ANNUAL`, `HALF_DAY`, `RESERVE_FORCES`, `SICK`, `BEREAVEMENT`
- `LeavePolicy`: enum 기반 휴가 유형별 정책
- `LeaveRequest`: 요청 기간, 반차 구분, 일수, 상태, 승인 정보
- `LeaveAdjustment`: 직원별 수동 조정
- `LeaveBalance`: 직원별/연도별 잔여 snapshot 성격
- `CompanyHoliday`: 회사 휴일

현재 구조로 가능한 것:

- 연차/반차/예비군/병가/경조사 요청
- 토/일/회사 휴일 제외 계산
- PENDING/APPROVED 기준 잔여 계산
- 단순 수동 조정
- OWNER/LEAD 승인

현재 구조로 어려운 것:

- 관리자가 휴가 유형을 동적으로 생성
- 휴가 유형별 복잡한 지급 정책
- 날짜별 다른 사용 단위
- 시간/분 단위 휴가
- 장부형 잔여 추적
- 증명자료 제출 시점 관리
- 휴가 유형별 승인 정책

## 2. LeaveType 모델 후보

목적:

- 기존 enum 기반 휴가 유형을 DB 모델 기반으로 확장한다.
- 연차와 맞춤휴가를 구분한다.

주요 필드 후보:

- `id`
- `code`
- `name`
- `category`: `ANNUAL` 또는 `CUSTOM`
- `description`
- `isPaid`
- `paidRate`
- `isEnabled`
- `createdAt`
- `updatedAt`

기존 모델과의 관계:

- 기존 `LeavePolicy.type` enum을 장기적으로 `leaveTypeId` 관계로 대체한다.
- 기존 `LeaveRequest.type` enum은 migration 단계에서 `leaveTypeId`로 전환한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- enum 값 5개를 seed 또는 migration script로 `LeaveType` row로 생성한다.
- 기존 `LeaveRequest.type`은 신규 `leaveTypeId`로 backfill한다.

1차 MVP와의 호환성:

- 초기에는 enum과 신규 모델을 병행하는 adapter를 둔다.
- 화면/계산은 기존 helper를 유지하고 신규 모델 조회를 점진 연결한다.

위험 요소:

- enum과 DB row의 중복 source of truth.
- migration 중 기존 요청 type mapping 오류.

테스트 필요 항목:

- 기존 휴가 유형 mapping
- 신규 맞춤휴가 생성
- 비활성 휴가 유형 요청 차단

## 3. LeavePolicy 확장 후보

목적:

- 휴가 유형별 정책 엔진 역할을 한다.

주요 필드 후보:

- `leaveTypeId`
- `grantMethod`
- `grantAmount`
- `grantUnit`
- `usageUnit`
- `allowSplitUse`
- `mustUseAllAtOnce`
- `unusedBalancePolicy`
- `countsHolidays`
- `genderEligibility`
- `excludedTeamIds`
- `excludedEmploymentTypes`
- `visibility`
- `approvalPolicyId`
- `requiresAttachment`
- `attachmentPolicy`
- `attachmentGuide`

기존 모델과의 관계:

- 현재 `LeavePolicy`를 확장하거나, `CustomLeavePolicy`를 별도 모델로 둘 수 있다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 기존 `deductsAnnualBalance`, `requiresAttachment`, `isEnabled`는 신규 필드로 매핑한다.

1차 MVP와의 호환성:

- 기존 필드는 당분간 유지하고 신규 필드는 nullable로 시작한다.

위험 요소:

- 정책 필드가 많아지면 UI와 validation이 복잡해진다.

테스트 필요 항목:

- 증빙 필수 정책
- 연차 차감 여부
- 휴일 포함/제외 정책
- 사용 단위 제한

## 4. AnnualLeavePolicy 모델 후보

목적:

- 연차 부여 정책을 맞춤휴가 정책과 분리한다.

주요 필드 후보:

- `id`
- `basis`: `HIRE_DATE` 또는 `FISCAL_YEAR`
- `fiscalYearStartMonth`
- `fiscalYearStartDay`
- `monthlyGrantRule`
- `firstYearRule`
- `afterFirstYearBaseDays`
- `longServiceIncrementRule`
- `maxAnnualDays`
- `expirationPolicy`
- `carryOverPolicy`
- `gracePeriodDays`
- `isEnabled`

기존 모델과의 관계:

- `calculateAnnualEntitlement`의 정책 입력으로 사용한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 현재 hard-coded 기본 정책을 기본 row로 생성한다.

1차 MVP와의 호환성:

- 기본값은 현재 계산 결과와 최대한 동일하게 둔다.

위험 요소:

- 법무/노무 해석이 필요한 영역이다.

테스트 필요 항목:

- 입사 1년 미만
- 1년 이상
- 장기근속
- 최대 한도

## 5. LeaveGrant 모델 후보

목적:

- 맞춤휴가 또는 연차를 직원에게 지급한 원천을 기록한다.

주요 필드 후보:

- `id`
- `userId`
- `leaveTypeId`
- `amount`
- `unit`
- `validFrom`
- `expiresAt`
- `reason`
- `createdByUserId`
- `createdAt`
- `revokedAt`

기존 모델과의 관계:

- `LeaveAdjustment`보다 명시적인 지급 원천이다.
- `LeaveLedger.GRANTED` 이벤트와 연결한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 기존 `LeaveAdjustment`를 바로 옮기지 않고, 새 지급부터 `LeaveGrant`를 사용한다.

1차 MVP와의 호환성:

- 1차의 연차 조정 화면은 유지하고, 2차 맞춤휴가 지급 화면을 별도로 추가한다.

위험 요소:

- `LeaveAdjustment`와 `LeaveGrant`가 동시에 존재할 때 계산 중복 가능성.

테스트 필요 항목:

- 지급 후 장부 생성
- 지급 취소
- 만료 처리

## 6. LeaveLedger 모델 후보

목적:

- 잔여 휴가 변화를 장부처럼 추적한다.

주요 필드 후보:

- `id`
- `userId`
- `leaveTypeId`
- `eventType`
- `amount`
- `balanceAfter`
- `sourceType`
- `sourceId`
- `fiscalYear`
- `occurredAt`
- `createdByUserId`
- `reason`
- `metadata`

기존 모델과의 관계:

- `LeaveRequest`, `LeaveAdjustment`, `LeaveGrant`와 연결한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 1차 기존 요청/조정 데이터를 기준으로 초기 ledger backfill script를 별도 설계한다.
- backfill은 한번에 자동 적용하지 않고 dry-run 보고서를 먼저 만든다.

1차 MVP와의 호환성:

- 초기에는 계산 helper가 기존 방식과 ledger 방식을 비교하는 dual-read 검증 기간을 둔다.

위험 요소:

- 장부 이벤트 누락 시 잔여가 틀어진다.
- 상태 변경 transaction에서 ledger 생성이 함께 보장되어야 한다.

테스트 필요 항목:

- PENDING 생성
- 승인
- 반려
- 철회
- 승인 취소
- 조정
- 만료

## 7. LeaveRequestSegment 모델 후보

목적:

- 하나의 휴가 요청 안에서 날짜별 사용 단위와 차감량을 다르게 표현한다.

주요 필드 후보:

- `id`
- `leaveRequestId`
- `date`
- `unit`: `FULL_DAY`, `AM_HALF`, `PM_HALF`, `HOURS`, `MINUTES`
- `startTime`
- `endTime`
- `amount`
- `countsAsBusinessDay`
- `createdAt`

기존 모델과의 관계:

- `LeaveRequest`는 요청 header로 유지한다.
- 기존 `startDate`, `endDate`, `dayCount`는 요약값으로 유지하거나 점진 deprecated한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 기존 `LeaveRequest`마다 기본 segment를 생성한다.
- `HALF_DAY`는 AM/PM segment로 backfill한다.

1차 MVP와의 호환성:

- 기존 UI는 segment 1개 또는 기간 전체 segment로 변환해 저장한다.

위험 요소:

- 중복 휴가 검사 복잡도 증가.
- 시간/분 단위는 근무시간 정책과 연결되어야 한다.

테스트 필요 항목:

- 하루종일 + 반차 조합
- 같은 날짜 AM/PM 중복 규칙
- 시간 단위 중복
- 회사 휴일 포함 여부

## 8. LeaveAttachment 모델 후보

목적:

- 증명자료 metadata를 휴가 요청과 분리한다.

주요 필드 후보:

- `id`
- `leaveRequestId`
- `fileName`
- `fileUrl`
- `fileSize`
- `mimeType`
- `submittedAt`
- `submittedByUserId`
- `status`
- `metadata`

기존 모델과의 관계:

- 현재 `LeaveRequest.attachmentUrl`을 대체 또는 보완한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 기존 `attachmentUrl`이 있으면 `LeaveAttachment` row로 backfill한다.

1차 MVP와의 호환성:

- 2차 초반에는 `attachmentUrl`을 유지하고 신규 모델은 optional로 둔다.

위험 요소:

- 개인정보 및 민감자료 접근 통제.
- 파일 URL 노출 위험.

테스트 필요 항목:

- 증빙 필수 정책
- 권한별 접근 제한
- AuditLog 민감정보 마스킹

## 9. ApprovalPolicy 모델 후보

목적:

- 휴가 유형별 승인 방식을 확장한다.

주요 필드 후보:

- `id`
- `name`
- `mode`: `NONE`, `SINGLE`, `OWNER`, `TEAM_LEAD`, `DESIGNATED`, `SEQUENTIAL`
- `approverUserIds`
- `approverRole`
- `requiresCommentOnReject`
- `requiresCommentOnCancel`
- `isEnabled`

기존 모델과의 관계:

- `LeavePolicy.approvalPolicyId`와 연결한다.

마이그레이션 필요 여부:

- 필요.

기존 데이터 보존 방법:

- 현재 OWNER/LEAD 승인 원칙을 기본 정책으로 생성한다.

1차 MVP와의 호환성:

- 기본 정책은 기존 guard와 동일하게 동작한다.

위험 요소:

- 순차 승인 도입 시 상태 모델이 복잡해진다.

테스트 필요 항목:

- 승인 불필요
- 팀 리드 승인
- OWNER 승인
- 지정 승인자
- 자기 요청 승인 방지
