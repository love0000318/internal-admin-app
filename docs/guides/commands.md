# 운영자용 실행 명령

명령은 `package.json`의 실제 script 기준이다. Windows에서는 `pnpm.cmd`, Codex 환경에서는 `corepack pnpm`으로 실행할 수 있다.

| 명령 | 언제 사용하는지 | 실행 전 조건 | 성공 기준 |
| --- | --- | --- | --- |
| `pnpm install` | 의존성 설치 | Node/Corepack 사용 가능 | lockfile 기준 설치 완료 |
| `pnpm dev` | 개발 서버 실행 | `.env`와 DB 준비 | Next.js dev server 기동 |
| `pnpm build` | 배포 전 빌드 검증 | DB env 로드 가능 | Next build 성공 |
| `pnpm start` | build 이후 운영 서버 실행 | `pnpm build` 완료 | Next start 기동 |
| `pnpm lint` | 코드 스타일 검증 | 의존성 설치 | eslint 오류 없음 |
| `pnpm typecheck` | TypeScript 검증 | 의존성 설치 | `tsc --noEmit` 성공 |
| `pnpm test` | 전체 Vitest 실행 | 의존성 설치 | 모든 테스트 통과 |
| `pnpm test:unit` | unit test 실행 | unit config 존재 | 테스트 통과 |
| `pnpm test:integration` | integration test 실행 | DB가 필요한 경우 DB 준비 | 테스트 통과 |
| `pnpm e2e` | e2e 성격 test 실행 | e2e config 준비 | 테스트 통과 |
| `pnpm db:validate` | Prisma schema 검증 | Prisma config 준비 | schema valid |
| `pnpm db:generate` | Prisma client 생성 | schema valid | generated client 생성 |
| `pnpm db:migrate` | 개발 migration 적용 | 개발 DB 연결 | migration 적용 |
| `pnpm db:deploy` | 운영 migration 적용 | 운영 DB 백업 권장 | migration deploy 성공 |
| `pnpm db:status` | migration 상태 확인 | DB 연결 | DB up to date |
| `pnpm db:seed` | 기본 데이터 생성 | DB 연결 | OWNER invitation/기본 정책 seed |
| `pnpm preflight` | 운영 전 점검 | `.env`, DB 연결 | PASS, WARN 확인 |
| `pnpm hr:import <xlsx>` | HR 엑셀 import | private 경로의 xlsx, `ENCRYPTION_SECRET` | batch/prejoin 생성 |
| `pnpm leave:ledger:rebuild` | 기존 데이터를 ledger로 재구성 | DB 백업 권장 | idempotency 기준 완료 |
| `pnpm leave:ledger:validate` | 휴가 장부 정합성 검증 | DB 연결 | issues 0 |
| `pnpm jobs:birthday-half-day-grants -- --dry-run` | 생일 반차 지급 미리보기 | 생일 정책/직원 생일 | 변경 없이 결과 출력 |
| `pnpm jobs:birthday-half-day-grants` | 생일 반차 지급 실행 | dry-run 확인 권장 | 중복 없이 지급 |
| `pnpm jobs:schedule-annual-promotion-notices -- --dry-run` | 연차 촉진 일정 미리보기 | 연차 정책/ledger | 변경 없이 결과 출력 |
| `pnpm jobs:schedule-annual-promotion-notices` | 연차 촉진 일정 생성 | dry-run 확인 권장 | notice 생성 |
| `pnpm jobs:send-annual-promotion-notices` | due notice 인앱 알림 발송 | schedule 존재 | sent 처리 |
| `pnpm jobs:expire-annual-leaves -- --dry-run` | 연차 소멸 미리보기 | ledger/정책 준비 | 변경 없이 대상 출력 |
| `pnpm jobs:expire-annual-leaves` | 연차 소멸 실행 | dry-run/운영 승인 | EXPIRED ledger 생성 |
| `pnpm jobs:auto-confirm-past-start-leaves -- --dry-run` | 미승인 휴가 자동 확정 미리보기 | 승인 정책/ledger 준비 | 변경 없이 시작일이 지난 대상 출력 |
| `pnpm jobs:auto-confirm-past-start-leaves` | 미승인 휴가 자동 확정 실행 | dry-run/운영 승인 | APPROVED 전환 및 USED ledger 생성 |

## 현재 없는 명령 / TODO

- `attachments:check`: 첨부 metadata와 local private storage 파일 존재 여부를 점검하는 명령은 현재 package.json에 없다.
- 통합 `jobs:annual-leave-maintenance`: 개별 연차 촉진/발송/소멸 명령은 있으나 통합 명령은 현재 없다.

## 초대 가입 인증 코드 운영

- `INVITATION_VERIFICATION_CODE_EXPIRES_IN_DAYS`: 가입 인증 코드 유효기간. 기본값은 초대 유효기간과 동일하게 둔다.
- `INVITATION_VERIFICATION_CODE_MAX_ATTEMPTS`: 실패 허용 횟수. 기본 5회.
- `INVITATION_VERIFICATION_CODE_LENGTH`: 코드 길이. 기본 8자리.
- 별도 이메일/휴대폰 API는 필요하지 않으며, OWNER가 링크와 코드를 직접 전달한다.

### OWNER 초대 재발급

명령: `pnpm db:reissue-owner-invitation`

- ACTIVE OWNER가 아직 없고 기존 OWNER 초대 코드/링크를 분실했을 때만 사용한다.
- 기존 PENDING OWNER 초대와 인증 코드는 폐기하고 새 초대 링크와 가입 인증 코드를 한 번 출력한다.
- ACTIVE OWNER가 이미 있으면 실행이 차단된다.
## 내부 단축 초대 URL 관련 운영

단축 초대 URL은 별도 외부 명령 없이 직원 초대 생성과 OWNER 초대 seed/reissue 과정에서 자동으로 생성된다.

- 직원 초대: `/organization/invitations`에서 OWNER가 실행
- OWNER 최초 초대: `pnpm db:seed`
- OWNER 초대 재발급: `pnpm db:reissue-owner-invitation`

주의사항:

- shortToken 원문은 생성 직후 한 번만 표시된다.
- 분실 시 기존 초대를 재발급해 새 단축 URL과 새 가입 인증 코드를 생성한다.
- 외부 URL 단축 서비스는 사용하지 않는다.

## 외부 캘린더 구독 관련 명령

별도 운영 script는 없다. DB 변경이 있으므로 배포 전 다음을 실행한다.

```powershell
corepack pnpm db:generate
corepack pnpm db:deploy
```

운영 DB에서는 `migrate reset`을 사용하지 않는다.