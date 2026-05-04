# 휴가 현황 조회/엑셀 업로드 배포 준비 보고서

## 릴리즈 목적

구성원 휴가 현황 조회 권한과 OWNER 전용 휴가 현황 엑셀 업로드 운영 기능을 production에 안전하게 배포하기 위한 최종 점검 기록입니다.

## 포함 기능

- OWNER 전체 구성원 휴가 현황 조회
- LEAD 담당 조직 및 하위 조직 구성원 휴가 현황 조회
- MANAGER 본인 휴가 현황만 조회
- EXTERNAL_PARTNER 내부 휴가 현황 접근 차단
- 구성원 휴가 현황 상세
- 휴가 현황 엑셀 템플릿 다운로드
- 엑셀 업로드, 미리보기, 직원 매칭, 검증
- Step-up 후 휴가 잔여 조정 반영
- 업로드 이력 및 상세 조회
- APPLIED batch 반영 취소/역조정
- AuditLog 기록
- 모바일 카드형 UI

## 권한 정책

| 기능 | OWNER | LEAD | MANAGER | EXTERNAL_PARTNER |
|---|---:|---:|---:|---:|
| 전체 구성원 휴가 현황 | 가능 | 불가 | 불가 | 불가 |
| 담당 조직 휴가 현황 | 가능 | 가능 | 불가 | 불가 |
| 본인 휴가 현황 | 가능 | 가능 | 가능 | 불가 |
| 엑셀 템플릿 다운로드 | 가능 | 불가 | 불가 | 불가 |
| 엑셀 업로드/미리보기 | 가능 | 불가 | 불가 | 불가 |
| 최종 반영 | Step-up 필요 | 불가 | 불가 | 불가 |
| 반영 취소/역조정 | Step-up 필요 | 불가 | 불가 | 불가 |

서버 action과 route에서 scope 기반 권한 검증을 적용합니다. LEAD에게 전체 직원 데이터를 내려준 뒤 클라이언트에서 필터링하지 않습니다.

## 엑셀 템플릿

템플릿은 ACTIVE 직원과 현재 시스템 휴가 현황 참고값을 포함합니다.

컬럼:

- 직원명
- 이메일
- 사번
- 팀
- 기준연도
- 총 부여 연차
- 사용 연차
- 승인대기 연차
- 잔여 연차
- 조정 메모

템플릿에는 주민등록번호, 계좌번호, 주소, 급여정보, 가족정보, token/hash/secret을 포함하지 않습니다.

## 엑셀 업로드와 반영

휴가 현황 엑셀 업로드는 과거 휴가 요청 이력을 복원하는 기능이 아니라, 현재 휴가 잔여를 맞추기 위한 조정 기능입니다.

운영자는 반영 전 미리보기에서 직원 매칭, 기준연도, 수량, 오류 행, 경고 행, 조정 예정값을 확인해야 합니다. ERROR row와 미매칭 row는 반영하지 않습니다.

최종 반영은 기존 LeaveRequest, LeaveLedger, LeaveAdjustment를 삭제하거나 덮어쓰지 않고 LeaveAdjustment 및 LeaveLedger ADJUSTED 이벤트를 추가합니다.

## 반영 취소/역조정

잘못 반영한 APPLIED batch는 삭제하지 않습니다. 반영 취소는 기존 조정 기록을 유지한 채 반대 방향의 LeaveAdjustment/LeaveLedger 조정 이벤트를 생성하는 역조정 방식입니다.

## AuditLog

다음 이벤트를 AuditLog로 추적합니다.

- 템플릿 다운로드
- 업로드/파싱/검증/반영
- 반영 차단
- 반영 취소/역조정

AuditLog metadata에는 엑셀 row 원문 전체, 전화번호 원문, 주민등록번호, 계좌번호, token/hash/secret, fileKey/private path를 저장하지 않습니다.

## 실행 명령 결과

- `corepack pnpm db:generate`: 통과
- `corepack pnpm db:validate`: 통과
- `corepack pnpm typecheck`: 통과
- `corepack pnpm test`: 통과
- `corepack pnpm lint`: 통과
- `corepack pnpm build`: 통과
- `corepack pnpm prisma migrate status`: 로컬 PostgreSQL 연결 실패로 확인 불가

`migrate status` 실패는 로컬 `localhost:5432` 연결 문제입니다. 운영 Neon DB에는 실제 운영 `DATABASE_URL`을 설정한 뒤 `prisma migrate deploy`로만 적용합니다.

## Migration 필요 여부

Prisma schema에는 휴가 import와 역조정을 위한 모델/enum 변경이 포함되어 있습니다. 운영 DB에 아직 적용되지 않았다면 아래 migration들을 포함한 pending migration을 `prisma migrate deploy`로 적용해야 합니다.

- `20260504090000_add_leave_imports`
- `20260504110000_add_leave_import_reconciliation`
- `20260504130000_leave_import_reverse`

운영 DB에서 `prisma migrate reset`과 `prisma migrate dev`는 사용하지 않습니다.

## 환경변수

휴가 import 파일 크기 제한은 다음 환경변수로 조정할 수 있습니다.

- `MAX_LEAVE_IMPORT_FILE_SIZE_MB`

값이 없으면 기본 10MB 정책으로 운영합니다. 실제 secret 값은 문서에 기록하지 않습니다.

## P0 Blocker

현재 코드 검수와 로컬 명령 기준 P0 blocker는 확인되지 않았습니다.

## P1 개선 항목

- 운영 Neon DB에서 migration deploy 결과 확인 필요
- production 배포 후 권한 smoke test 필요
- 실제 모바일 기기에서 import 상세/역조정 dialog 확인 필요

## P2 후속 항목

- 상세 휴가 사용 내역 import에 대한 자동 reverse 범위 확대
- LEAD 담당 조직 export 정책 검토
- 비활성 직원 포함 템플릿 옵션

## 배포 가능 여부

**제한적으로 배포 가능**

로컬 lint/typecheck/test/build는 통과했으나, 로컬 DB 연결 문제로 migrate status를 확인하지 못했습니다. 운영 Neon DB에서 `prisma migrate deploy`를 성공시키고 배포 후 smoke test를 통과하면 직원/관리자 운영에 열 수 있습니다.

## 배포 전 명령

```powershell
git add .
git commit -m "Finalize leave balance visibility and import"
git push

$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy

vercel.cmd --prod
```

DB 변경이 이미 운영 DB에 반영되어 있다면 migration deploy는 상태 확인 목적으로 실행합니다. seed는 이번 기능의 필수 배포 절차가 아니며, 운영 DB에 무심코 재실행하지 않습니다.

## 배포 후 Smoke Test

배포 후에는 [휴가 현황 조회/엑셀 업로드 배포 후 Smoke Test](./leave-balance-import-post-deploy-smoke-test.md)를 수행합니다.
