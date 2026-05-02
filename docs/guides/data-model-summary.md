# 데이터 모델 요약

Prisma schema 기준 주요 모델 요약이다.

## 인증/세션

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `User` | 사용자 계정 | email, name, role, status, teamId, passwordHash | Team, Session, HR/Leave 관계 | passwordHash 민감 | password 원문 저장 금지 |
| `Session` | 로그인 세션 | userId, tokenHash, expiresAt, revokedAt | User | tokenHash 민감 | token 원문 DB 저장 금지 |
| `IdentityVerification` | 가입 검증 기록 | provider, verifiedName, verifiedPhone | User/Invitation | 전화번호 민감 | production mock 차단 |

## 사용자/팀

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `Team` | 조직/팀 | name, parentTeamId, leadUserId, status | User, Invitation | 낮음 | LEAD 범위 계산에 사용 |

## 초대/온보딩

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `Invitation` | 초대 링크 | email, role, tokenHash, status, expiresAt | User, Team, EmployeePrejoinProfile | tokenHash 민감 | token 원문 저장 금지 |
| `EmployeeImportBatch` | HR import 실행 단위 | fileName, totalRows, status | EmployeePrejoinProfile | 파일명 주의 | 원본 파일 내용 저장 금지 |
| `EmployeePrejoinProfile` | 가입 전 직원 초안 | companyEmail, legalName, teamName, encrypted fields | Invitation, draft records | 민감 필드 포함 | 화면/CSV 마스킹 |

## HR 프로필

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `EmployeeProfile` | 기본 직원 프로필 | displayName, phoneNumber, address, profileCompletedAt | User, Team | 개인정보 포함 | 직원 자기 정보 중심 |
| `EmployeeSensitiveProfile` | 민감 인사/계좌 정보 | residentIdEncrypted, bankAccountEncrypted | User | 매우 민감 | 암호화 저장 |
| `EmploymentProfile` | 재직/조직/직무 정보 | hireDate, organizationName, jobGrade | User | 중간 | 직원 직접 수정 불가 |
| `EmploymentContractProfile` | 근로계약 정보 | contractType, dates, probation | User | 민감 | OWNER 전용 |
| `CompensationProfile` | 임금/보상 정보 | contractAmount, basePay fields | User | 매우 민감 | export 기본 제외 |
| `FamilyMember` | 가족 정보 | name, relationship, residentIdEncrypted | User | 매우 민감 | 주민번호 암호화 |
| `CareerRecord`, `EducationRecord`, `LanguageSkill`, `CertificateRecord`, `ProjectSkillRecord`, `TrainingRecord` | 경력/학력/역량/교육 | 각 record 필드 | User | 일부 개인정보 | 직원 수정 가능 영역 |
| `EmployeeProfileChangeRequest` | 민감정보 변경 요청 | section, status, requestedChanges | User, reviewer | 민감 가능 | AuditLog 원문 금지 |

## 휴가 유형/정책

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `LeavePolicy` | 1차 기본 휴가 정책 | type, maxDays, approvalRequired | 없음 | 낮음 | legacy 유지 |
| `LeaveTypeDefinition` | 2차 휴가 유형 | code, category, attachmentPolicy, visibility, approvalPolicyId | LeaveGrant, LeaveRequest | 낮음 | 시스템 기본 보호 |
| `AnnualLeavePolicy` | 연차 정책 | fiscalYearStart, usageUnit, promotion fields | User approver | 낮음 | 노무 검토 필요 |
| `BirthdayLeavePolicy` | 생일 반차 정책 | enabled, grant timing | 없음 | 낮음 | 중복 지급 방지 |
| `ApprovalPolicy` | 승인 정책 | approvalMode, approverRule, customApproverUserId | LeaveTypeDefinition | 낮음 | sequential TODO |

## 휴가 요청/지급/장부

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `LeaveRequest` | 휴가 요청 | userId, type, status, dates, reason, attachmentStatus | User, LeaveTypeDefinition | 사유 민감 가능 | 캘린더에 사유 노출 금지 |
| `LeaveGrant` | 맞춤휴가/생일 반차 지급 | amount, usedAmount, pendingAmount, expiresAt | User, LeaveTypeDefinition | 낮음 | 수량 정합성 중요 |
| `LeaveRequestGrantUsage` | 요청과 지급 연결 | leaveRequestId, leaveGrantId, amount | LeaveRequest, LeaveGrant | 낮음 | 중복 차감 방지 |
| `LeaveAdjustment` | 수동 연차 조정 | days, reason | User | 사유 주의 | Ledger ADJUSTED 연결 |
| `LeaveLedger` | 휴가 장부 | eventType, amount, source, idempotencyKey | User, LeaveRequest, LeaveGrant | 낮음 | source of truth |
| `LeaveBalance` | 기존 잔여/cache | annualEntitled, usedDays, pendingDays | User | 낮음 | 점진 전환 대상 |

## 증명자료

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `LeaveAttachment` | 증명자료 metadata | fileName, fileKey, status, reviewComment | LeaveRequest, User | 매우 민감 | fileKey/private path 노출 금지 |

## 연차 촉진

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `AnnualLeavePromotionNotice` | 촉진 알림 schedule | noticeType, scheduledDate, remainingAmount | User, UsePlan | 낮음 | 중복 생성 방지 |
| `AnnualLeaveUsePlan` | 사용계획 | status, totalPlannedAmount, submittedAt | User, items | 낮음 | 실제 휴가 요청 아님 |
| `AnnualLeaveUsePlanItem` | 사용계획 항목 | plannedDate, amount, halfDayPeriod | UsePlan | 낮음 | 중복 날짜 검증 |
| `AnnualLeaveExpirationRun` | 소멸 job 이력 | processedDate, counts, status | 없음 | 낮음 | 자동 수정 최소화 |

## Notification, JobRun, AuditLog

| 모델 | 목적 | 주요 필드 | 관계 | 민감정보 여부 | 주의사항 |
| --- | --- | --- | --- | --- | --- |
| `Notification` | 인앱 알림 | type, priority, title, message, linkUrl, metadata | User | metadata 주의 | 민감정보 금지 |
| `JobRun` | Job 실행 이력 | jobName, status, counts, resultSummary | User | summary 주의 | 집계 중심 |
| `AuditLog` | 감사 로그 | action, targetType, metadata, beforeJson, afterJson | User | metadata 주의 | sanitizer 적용 |

## 리포트/export

리포트는 별도 DB 모델보다 `src/lib/reports/*` helper와 `/admin/reports/export` route를 사용한다. CSV는 allowlist 기반으로 생성하고 `REPORT_EXPORTED` AuditLog를 남긴다.
