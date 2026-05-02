# 다음 작업 목록

운영 전 안정화 기준의 blocker와 TODO 목록이다.

## P0 - 즉시 수정해야 할 blocker

- 항목: 현재 발견된 P0 blocker 없음
  - 상태: 확인 완료
  - 영향: 자동 검증 기준 운영을 즉시 막는 문제 없음
  - 권장 조치: 운영 환경에서 실제 HR 엑셀, 브라우저 smoke test를 수행하며 새 P0가 생기면 이 섹션에 추가
  - 담당 영역: QA/운영

## P1 - 운영 전 수정 권장

- 항목: HR 사전 프로필 전용 검수 화면 부재
  - 상태: PARTIAL
  - 영향: import/prejoin 모델과 초대 연결은 있으나, `/admin/hr/prejoin-profiles` 전용 운영 화면은 현재 없음
  - 권장 조치: 현재는 HR import 결과와 초대 화면/리포트로 운영하고, 전용 검수 화면은 안정화 TODO로 개발
  - 담당 영역: HR 온보딩

- 항목: Cron endpoint route 부재
  - 상태: PARTIAL
  - 영향: `assertCronRequestAuthorized` helper는 있으나 `/api/cron/*` route는 현재 없음. 운영 자동화는 CLI/서버 scheduler로 실행해야 함
  - 권장 조치: 운영에서 HTTP cron이 필요해지는 시점에 `CRON_SECRET` 보호 endpoint를 추가
  - 담당 영역: Job/Cron

- 항목: 기존 일부 문서 인코딩 깨짐
  - 상태: PARTIAL
  - 영향: README, AGENTS, operation-guide 등 일부 오래된 문서가 콘솔에서 깨져 보일 수 있음
  - 권장 조치: 기능 코드와 분리된 문서 전용 작업으로 UTF-8 정리
  - 담당 영역: 문서

- 항목: `private/uploads` 디렉터리 미생성
  - 상태: 환경 준비 필요
  - 영향: 실제 local attachment upload 전 디렉터리 준비 필요
  - 권장 조치: 운영 배포 시 `PRIVATE_UPLOAD_DIR` 생성 및 백업 정책 수립
  - 담당 영역: 운영/파일 보안

- 항목: 운영 `.env` 보강
  - 상태: 환경 준비 필요
  - 영향: 로컬 preflight는 WARN으로 통과하지만 운영에서는 명시값 필요
  - 권장 조치: `CRON_SECRET`, `MAX_LEAVE_ATTACHMENT_SIZE_MB`, `PRIVATE_UPLOAD_DIR` 확정
  - 담당 영역: 운영

- 항목: 실제 HR 엑셀 import 리허설
  - 상태: 운영 전 수동 검수 필요
  - 영향: 자동 테스트는 통과했지만 실제 회사 원장 컬럼/값은 현장 검증 필요
  - 권장 조치: 더미 또는 실제 운영 샘플로 `pnpm hr:import` 리허설
  - 담당 영역: HR/QA

## P2 - 3차 개발 후보

- 항목: 실제 이메일/Slack/Kakao/SMS 알림
  - 상태: NOT_STARTED
  - 영향: 현재는 인앱 Notification 중심
  - 권장 조치: 3차 알림 provider 설계
  - 담당 영역: 알림

- 항목: 외부 캘린더 연동
  - 상태: NOT_STARTED
  - 영향: 현재는 내부 `/leaves/calendar`만 제공
  - 권장 조치: Google Calendar, Outlook, iCal feed는 3차 후보
  - 담당 영역: 휴가 캘린더

- 항목: 외부 private file storage와 바이러스 검사
  - 상태: NOT_STARTED
  - 영향: 현재는 local private storage adapter 중심
  - 권장 조치: S3/GCS/Azure Blob, malware scan 도입 검토
  - 담당 영역: 파일 보안

- 항목: 전자계약/전자서명/급여명세서/퇴사자 정산
  - 상태: NOT_STARTED
  - 영향: 현재 범위 밖
  - 권장 조치: HR 3차 로드맵으로 분리
  - 담당 영역: HR/급여

- 항목: 근태/출퇴근/근무유형/교대근무
  - 상태: NOT_STARTED
  - 영향: 월차 개근 판단은 현재 운영 정책/수동 검토 기반
  - 권장 조치: 근태 도입 이후 연차 계산과 연결
  - 담당 영역: 근태

- 항목: SSO/MFA/IP allowlist
  - 상태: NOT_STARTED
  - 영향: 현재 자체 세션/초대 기반
  - 권장 조치: 운영 보안 3차 고도화로 검토
  - 담당 영역: 보안

## 보안 TODO

- 항목: 암호화 key rotation 절차 수립
  - 상태: TODO
  - 영향: 장기 운영 시 키 교체 절차 필요
  - 권장 조치: 별도 운영 절차 문서화
  - 담당 영역: 보안

- 항목: 정기 권한 리뷰
  - 상태: TODO
  - 영향: 퇴사/조직 변경 시 권한 잔존 위험
  - 권장 조치: 월간 권한 리뷰 체크리스트 운영
  - 담당 영역: 보안/HR

## 문서 TODO

- 항목: 기존 문서 UTF-8 정리
  - 상태: TODO
  - 영향: 일부 문서가 콘솔 또는 편집기에서 깨져 보일 수 있음
  - 권장 조치: 기능 코드 변경 없이 문서 인코딩 정리 전용 작업 수행
  - 담당 영역: 문서

- 항목: 운영자 smoke test 결과 기록
  - 상태: TODO
  - 영향: 자동 검증 외 실제 브라우저 리허설 증적 필요
  - 권장 조치: `docs/v2-rehearsal-report.md`에 현장 결과 추가
  - 담당 영역: QA

## 테스트 TODO

- 항목: 브라우저 기반 E2E 보강
  - 상태: TODO
  - 영향: 현재 Vitest 중심이며 실제 사용자 클릭 플로우 증적은 수동 문서 중심
  - 권장 조치: OWNER 가입, 직원 가입, 휴가 요청/승인, 리포트 export 대표 플로우 자동화
  - 담당 영역: QA

- 항목: 실제 HR 엑셀 fixture 통합 테스트
  - 상태: TODO
  - 영향: 실제 원장 변형에 대한 회귀 방어 강화 필요
  - 권장 조치: 개인정보 없는 fixture를 추가하고 import 테스트 자동화
  - 담당 영역: HR/QA
