# 알림센터와 자동 작업 운영 가이드

## 알림센터 목적

알림센터는 휴가, 증명자료, 연차 촉진, 인사정보, 리포트, 자동 작업 관련 인앱 알림을 사용자가 직접 확인하는 공간이다.

- 경로: `/notifications`
- 사용자는 자기 알림만 볼 수 있다.
- OWNER도 다른 직원의 개인 알림 목록을 직접 조회하지 않는다.
- 실제 이메일, 카카오, Slack, SMS 발송은 이번 단계에서 구현하지 않는다.

## 알림 기능

- 읽지 않은 알림 수 표시
- 알림 유형별 필터
- 우선순위 표시: 낮음, 보통, 높음
- 개별 읽음 처리
- 모두 읽음 처리
- `linkUrl`이 있는 알림은 이동 시 읽음 처리

알림 metadata에는 주민등록번호, 계좌번호, token, tokenHash, passwordHash, fileKey, private path, 증명자료 내용, 급여 상세를 넣지 않는다.

## 알림 그룹

- 휴가
- 증명자료
- 연차 촉진
- 인사정보
- 온보딩
- 리포트
- Job
- 시스템

## JobRun

JobRun은 자동 작업과 수동 dry-run 실행 이력을 남기는 테이블이다.

기록 항목:

- 작업명
- 상태: RUNNING, SUCCESS, FAILED, PARTIAL
- 실행 방식: SYSTEM, MANUAL, CRON
- dry-run 여부
- 시작/종료 시각
- 확인/생성/수정/건너뜀/실패 수
- 민감정보가 제거된 resultSummary 또는 errorSummary

## 자동 작업 종류

- 생일 반차 자동 지급: `jobs:birthday-half-day-grants`
- 연차 촉진 스케줄 생성: `jobs:schedule-annual-promotion-notices`
- 연차 촉진 알림 발송: `jobs:send-annual-promotion-notices`
- 연차 소멸: `jobs:expire-annual-leaves`
- LeaveLedger 검증: `leave:ledger:validate`
- LeaveLedger rebuild: `leave:ledger:rebuild`
- HR import: `hr:import`

## OWNER Job 관리 화면

- 경로: `/admin/jobs`
- OWNER만 접근할 수 있다.
- 작업 실행 이력과 상세 결과를 조회한다.
- 안전한 dry-run 작업만 UI에서 실행할 수 있다.

UI에서 허용하는 작업:

- LeaveLedger 정합성 검증 dry-run
- 연차 촉진 스케줄 dry-run
- 연차 소멸 dry-run
- 생일 반차 지급 dry-run
- 첨부파일 상태 점검 dry-run

UI에서 제한하는 위험 작업:

- LeaveLedger rebuild
- HR import
- 실제 파일 정리
- 대규모 데이터 변경 작업

위험 작업은 CLI와 운영 문서를 통해서만 실행한다.

## dry-run과 실제 실행

dry-run은 데이터를 변경하지 않고 대상과 결과 요약만 확인한다.

실제 실행 job은 운영자가 대상과 영향을 확인한 뒤 CLI 또는 보호된 cron으로 실행한다.

## Cron endpoint 보안

cron endpoint를 추가하거나 사용할 때는 다음을 지킨다.

- `CRON_SECRET` 필수
- production에서 `CRON_SECRET`이 없으면 실행 금지
- `X-Cron-Secret` 또는 `Authorization: Bearer ...` header로 검증
- query string token은 피한다.
- 응답에 민감정보를 포함하지 않는다.
- 실행 결과는 JobRun에 기록한다.

## preflight 점검 항목

preflight는 다음 항목을 점검한다.

- 필수 env
- SESSION_SECRET, ENCRYPTION_SECRET 길이와 분리
- CRON_SECRET 상태
- 첨부파일 private upload dir이 public 하위가 아닌지
- DB 연결
- OWNER 또는 OWNER 초대 존재
- 기본 LeavePolicy, LeaveTypeDefinition, AnnualLeavePolicy, ApprovalPolicy
- Notification, JobRun, LeaveLedger table 접근
- production mock provider 차단

## 실패 시 확인할 것

- JobRun 상세의 errorSummary
- OWNER 알림센터의 Job 실패 알림
- `pnpm preflight`
- `pnpm leave:ledger:validate`
- 관련 job CLI의 dry-run 결과

## 후순위 TODO

- 외부 queue 시스템
- Job 자동 재시도
- 외부 모니터링 연동
- 이메일/Slack/Kakao 알림
- 비동기 대량 export 완료 알림
