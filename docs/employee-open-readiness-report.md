# 직원 오픈 Readiness Report

작성일: 2026-05-04  
운영 URL: `https://interal-admin-app.vercel.app`

## 최종 판단

**직원 오픈 보류**

현재 production URL 기본 접근성은 확인되었지만, OWNER/직원 테스트 계정 기반 smoke test가 완료되지 않았다. 또한 근태/출퇴근을 오픈 범위에 포함한다면 production에서 `/attendance`, `/attendance/history`, `/admin/attendance`가 404로 확인된 점이 P0 blocker다.

근태를 이번 오픈 범위에서 제외하고, OWNER/직원 초대/가입/휴가 요청/승인/모바일/보안 smoke test가 통과하면 **제한적으로 직원 오픈 가능**으로 전환할 수 있다.

## 오픈 대상

권장 단계:

1. 대표 + 테스트 직원 1~2명
2. 핵심 운영 직원 3~5명
3. 전체 직원

## 검수 완료 항목

- [x] production URL 기본 접근성 확인
- [x] 직원 최종 안내문 작성
- [x] 초대 rollout 체크리스트 작성
- [x] 직원별 rollout tracker template 작성
- [x] 첫 주 운영 모니터링 문서 작성
- [x] 이슈 대응 문서 작성
- [x] 일일 관리자 체크리스트 작성
- [x] 직원 FAQ 작성

## 검수 미완료 항목

- [ ] OWNER 로그인 production smoke test
- [ ] 직원 초대/가입 production smoke test
- [ ] 휴가 요청/승인 production smoke test
- [ ] 모바일 실기기 검수
- [ ] role별 권한 차단 검수
- [ ] Step-up 고위험 작업 검수
- [ ] Neon migration/preflight 결과 확인
- [ ] 근태 포함 여부 결정

## 남은 이슈

### P0

- 근태를 오픈 범위에 포함하면 `/attendance`, `/attendance/history`, `/admin/attendance` 404가 blocker다.
- 인증 기반 production smoke test가 완료되지 않았다.
- Neon 운영 DB migration/preflight 결과가 확인되지 않았다.

### P1

- 모바일 실기기 검수 필요
- Vercel production env dashboard 확인 필요
- 외부 알림 활성/비활성 정책 확정 필요
- 문의처와 담당자 확정 필요

### P2

- 카카오 알림톡
- GPS 근태 인증
- 급여 정산
- 전자계약
- SSO/MFA
- Google Calendar 양방향 OAuth
- 파일 바이러스 검사

## 직원 안내문 준비 여부

준비 완료:

- `docs/employee-open-message-final.md`
- `docs/employee-onboarding-message.md`

## 관리자 체크리스트 준비 여부

준비 완료:

- `docs/owner-operation-checklist.md`
- `docs/employee-invitation-rollout-checklist.md`
- `docs/employee-rollout-tracker-template.md`
- `docs/daily-admin-checklist.md`

## 운영 모니터링 준비 여부

준비 완료:

- `docs/first-week-operations-monitoring.md`
- `docs/employee-open-issue-response.md`
- `docs/production-incident-runbook.md`

## 권장 오픈 방식

전 직원 동시 오픈 금지. 다음 순서로 진행한다.

1. 대표 + 테스트 직원 1~2명으로 초대/가입/휴가/모바일/알림을 확인한다.
2. 핵심 운영 직원 3~5명으로 실제 문의와 승인 흐름을 확인한다.
3. P0가 없고 P1이 수용 가능하면 전체 직원에게 안내문을 발송한다.

## 전 직원 오픈 전 조건

- [ ] 근태 포함 여부 결정
- [ ] production OWNER 로그인 통과
- [ ] 테스트 직원 초대/가입 통과
- [ ] 휴가 요청/승인 통과
- [ ] 모바일 핵심 화면 통과
- [ ] 보안 대시보드/AuditLog 확인
- [ ] 운영 문의처 확정
- [ ] 첫 주 일일 점검 담당자 지정
