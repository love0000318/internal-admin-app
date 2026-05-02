# MVP TODO

## 완료된 MVP 범위

- [x] Next.js App Router + TypeScript + Tailwind + Prisma 기반
- [x] Prisma schema와 초기 migration
- [x] OWNER invitation seed
- [x] 초대 링크 가입
- [x] 전화번호 + 비밀번호 로그인
- [x] 로그아웃과 session revoke
- [x] httpOnly/sameSite/production secure cookie 설정
- [x] token/password 원문 저장 금지 구조
- [x] production mock 본인인증 차단
- [x] 역할별 좌측 메뉴
- [x] protected route/server action 권한 guard
- [x] 대시보드
- [x] 팀 생성/수정/비활성화
- [x] 직원 초대/취소/재발급
- [x] 직원 목록/상세/수정/비활성화
- [x] 마지막 OWNER 보호
- [x] 휴가 정책/회사 휴일/휴가 조정
- [x] 내 휴가 현황
- [x] 연차/반차/예비군/병가/경조사 요청
- [x] PENDING 휴가 요청 철회
- [x] OWNER/LEAD 휴가 승인/반려/승인 취소
- [x] LEAD 담당 팀/하위 팀 scope 검증
- [x] AuditLog 기록과 OWNER 조회
- [x] AuditLog 민감정보 마스킹
- [x] 공통 한국어 label/badge/format helper
- [x] 권한 없음/404/error/loading 상태
- [x] unit/integration/e2e smoke 테스트
- [x] CI workflow
- [x] `/api/health`
- [x] `pnpm preflight`
- [x] README와 운영 문서

## 운영 전 필수 확인

- [ ] 실제 PostgreSQL 운영 DB 준비
- [ ] 운영 env와 secret 설정
- [ ] 운영 DB 백업
- [ ] 운영 DB에서 `pnpm db:migrate` 실행
- [ ] 운영 DB에서 `pnpm db:status` 통과 확인
- [ ] 운영 DB에서 `pnpm db:seed` 실행
- [ ] OWNER 초대 URL 보관
- [ ] 운영 환경에서 `pnpm preflight` 통과 확인
- [ ] 배포 후 smoke test 수행

## 남은 개선 TODO

- [ ] 실제 이메일 발송 provider 연동
- [ ] 실제 본인인증 provider 연동
- [ ] 비밀번호 재설정 기능
- [ ] Playwright 브라우저 기반 E2E 확장
- [ ] 휴가 요청 수정 기능
- [ ] 승인 완료/취소/반려 목록 UX 고도화
- [ ] 휴가 정책 `maxDaysPerYear` enforcement 고도화
- [ ] 휴가 승인 동시성 방어를 DB lock 또는 serializable transaction으로 강화
- [ ] 파일 업로드 스토리지 연동
- [ ] 알림 기능
- [ ] 휴가 캘린더
- [ ] 관리자 통계 대시보드

## 2차 개발 후보

- 업무 Task 관리
- 회의 일정 관리
- 회의록 작성/승인
- 업무 성과 관리
- 프로젝트 이슈 관리
- 외부 스포츠 시설 운영자 페이지
- 외부 연계 서비스 게시물 승인/작성
- 급여/근태 시스템 연동
