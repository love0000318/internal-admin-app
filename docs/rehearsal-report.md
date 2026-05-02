# 운영 전 리허설 보고서

작성일: 2026-05-01

## 1. 리허설 목적

대표, 직원, 리드가 실제 서비스를 사용하기 전에 핵심 업무 흐름과 권한 차단, 운영 문서를 최종 확인한다.

## 2. 실행한 명령

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm db:validate`
- `pnpm db:generate`
- `pnpm preflight`

## 3. 확인한 기능

- public health endpoint
- 로그인 화면
- 비로그인 protected route 차단
- route/build 구성
- 테스트 suite
- 운영 문서와 smoke checklist

## 4. 통과한 시나리오

- 코드 품질 검사 통과
- TypeScript 타입 검사 통과
- unit/integration/e2e smoke 테스트 통과
- production build 통과
- Prisma schema validate 통과
- Prisma client generate 통과

## 5. 실패한 시나리오

현재 로컬 환경에는 PostgreSQL이 실행 중이지 않아 DB 연결이 필요한 아래 항목은 실제 수행하지 못했다.

- `pnpm preflight`의 DB 연결/OWNER/LeavePolicy 확인
- `pnpm db:deploy`
- `pnpm db:seed`
- OWNER 초대 URL 기반 실제 가입
- 직원 초대/가입
- 휴가 요청/승인 실제 브라우저 흐름

## 6. 수정한 문제

- smoke test 문서를 체크박스와 기대 결과/실패 시 확인 형식으로 보완
- 대표/직원/LEAD 첫 사용 가이드 추가
- 수동 리허설 절차와 문제 기록 양식 추가
- production readiness report에 운영 전 위험 요소 정리

## 7. 남은 문제

- 운영 또는 리허설 PostgreSQL 준비 필요
- seed 실행 후 OWNER 초대 URL 확인 필요
- 실제 브라우저에서 전체 업무 흐름 수동 리허설 필요

## 8. 실제 운영 가능 여부

**제한적으로 실제 사용 가능**

앱과 문서는 운영 준비 상태다. 단, 실제 운영 시작 전 운영 DB에서 migration, seed, preflight, smoke test를 완료해야 한다.

## 9. 운영 전 대표가 확인해야 할 항목

- OWNER 초대 URL로 가입 가능
- 직원 초대 가능
- 직원 가입 가능
- 휴가 요청 가능
- OWNER 승인/반려/취소 가능
- LEAD 담당 범위 승인 가능
- MANAGER 관리자 접근 차단
- AuditLog 기록 확인

## 10. 다음 단계 제안

1. 운영 PostgreSQL 준비
2. `pnpm db:deploy`
3. `pnpm db:seed`
4. `pnpm preflight`
5. [smoke-test.md](smoke-test.md) 수동 수행
6. 실제 이메일/본인인증 연동 계획 수립
