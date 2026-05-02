# 운영 빠른 체크리스트

배포 또는 시연 직후 운영자가 빠르게 확인할 항목이다.

## 환경변수

- [ ] `DATABASE_URL`이 운영 DB를 가리킨다.
- [ ] `APP_BASE_URL`이 실제 서비스 주소다.
- [ ] `SESSION_SECRET`이 충분히 길고 예측 불가능하다.
- [ ] `ENCRYPTION_SECRET`이 설정되어 있고 `SESSION_SECRET`과 다르다.
- [ ] cron endpoint를 사용할 경우 `CRON_SECRET`이 설정되어 있다.
- [ ] 첨부파일을 사용할 경우 `PRIVATE_UPLOAD_DIR`와 `MAX_LEAVE_ATTACHMENT_SIZE_MB`를 확인했다.

## DB와 실행

- [ ] `pnpm db:deploy` 또는 환경에 맞는 migration을 적용했다.
- [ ] `pnpm db:seed`를 실행했다.
- [ ] `pnpm preflight`가 통과했다.
- [ ] `pnpm build`가 통과했다.

## 기본 운영

- [ ] OWNER가 로그인할 수 있다.
- [ ] 조직/팀을 생성하거나 확인했다.
- [ ] 직원 초대 링크를 만들 수 있다.
- [ ] 직원 가입이 가능하다.
- [ ] 직원별 휴가 보유 현황이 보인다.

## HR

- [ ] HR 엑셀 원본은 `private/imports` 아래에만 둔다.
- [ ] `pnpm hr:import private/imports/employee-master.xlsx`를 실행할 수 있다.
- [ ] 사전 직원 프로필과 온보딩 상태를 확인했다.
- [ ] 직원이 `/profile/confirm`에서 정보를 확인할 수 있다.

## 휴가

- [ ] 연차/반차 요청이 가능하다.
- [ ] 맞춤휴가 지급과 요청이 가능하다.
- [ ] 생일 반차 dry-run이 동작한다.
- [ ] OWNER 또는 담당 LEAD가 휴가를 승인/반려할 수 있다.
- [ ] `pnpm leave:ledger:validate` 결과 issue가 없다.

## 증명자료/캘린더/리포트

- [ ] 증명자료가 public 폴더가 아닌 private storage에 저장된다.
- [ ] 권한 없는 사용자는 첨부파일을 다운로드할 수 없다.
- [ ] 휴가 캘린더에 사유와 증명자료가 노출되지 않는다.
- [ ] 관리자 리포트 CSV에 민감정보가 없다.

## 알림/Job/보안

- [ ] `/notifications`에서 내 알림만 보인다.
- [ ] `/admin/jobs`는 OWNER만 접근한다.
- [ ] 주요 Job dry-run을 실행했다.
- [ ] AuditLog에 token, fileKey, 주민번호, 계좌번호 원문이 없다.
