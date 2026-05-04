# 휴가 현황 조회/엑셀 업로드 배포 후 Smoke Test

이 체크리스트는 Vercel production 재배포와 Neon PostgreSQL migration 적용 후 운영 화면에서 수행합니다. 실제 secret, token, DB URL, 실제 개인정보가 포함된 엑셀 원본은 기록하거나 공유하지 않습니다.

## 사전 조건

- [ ] 운영 DB에는 `prisma migrate deploy`만 사용했다.
- [ ] OWNER, LEAD, MANAGER, EXTERNAL_PARTNER 검수 계정이 준비되어 있다.
- [ ] 휴가 현황 업로드 테스트 파일은 가명 데이터이거나 운영자가 UI에서만 직접 업로드한다.
- [ ] 실제 엑셀 원본은 GitHub, public 폴더, 문서에 포함하지 않았다.

## 권한 Smoke Test

- [ ] OWNER 로그인
- [ ] OWNER가 전체 구성원 휴가 현황 조회
- [ ] OWNER가 구성원 휴가 상세 조회
- [ ] LEAD가 담당 조직/하위 조직 휴가 현황 조회
- [ ] LEAD가 담당 범위 밖 직원 URL 직접 접근 시 `접근 권한이 없습니다.` 또는 동등한 차단 응답 확인
- [ ] MANAGER가 구성원 휴가 현황 목록 접근 시 차단
- [ ] MANAGER가 `/leaves/me`에서 본인 휴가 확인
- [ ] EXTERNAL_PARTNER 내부 휴가 현황 접근 차단

## 템플릿 다운로드

- [ ] OWNER 엑셀 템플릿 다운로드
- [ ] 파일명이 정상적으로 내려온다.
- [ ] ACTIVE 직원만 포함된다.
- [ ] DEACTIVATED/DELETED 직원은 기본 제외된다.
- [ ] 주민등록번호, 계좌번호, 주소, 급여정보, 가족정보, token/hash/secret이 없다.
- [ ] 도움말 시트가 포함되어 있다.

## 엑셀 업로드와 반영

- [ ] OWNER 테스트 엑셀 업로드
- [ ] 미리보기에서 직원 매칭 결과 확인
- [ ] 기준연도, 총 부여, 사용, 승인대기, 잔여 값 확인
- [ ] 오류 행은 반영 대상에서 제외된다.
- [ ] 미매칭 행은 반영 대상에서 제외된다.
- [ ] 반영 예정 조정값이 현재 시스템 잔여와 엑셀 잔여 차이로 표시된다.
- [ ] Step-up 없이 반영 실패
- [ ] Step-up 후 반영 성공
- [ ] LeaveAdjustment 조정 기록 생성 확인
- [ ] LeaveLedger 조정 이벤트 생성 확인
- [ ] batch 재반영 차단
- [ ] AuditLog에 반영 기록이 남는다.
- [ ] AuditLog에 엑셀 원본 전체나 민감정보가 없다.

## 반영 취소/역조정

- [ ] APPLIED batch 상세 화면 접근
- [ ] Step-up 없이 반영 취소 실패
- [ ] Step-up 후 반영 취소 성공
- [ ] 기존 LeaveAdjustment/LeaveLedger가 삭제되지 않는다.
- [ ] 반대 방향 조정 기록이 새로 생성된다.
- [ ] batch 상태가 REVERSED로 변경된다.
- [ ] 이미 REVERSED batch 재취소가 차단된다.
- [ ] AuditLog에 역조정 기록이 남는다.

## 모바일 Smoke Test

360px, 390px, 430px viewport에서 확인합니다.

- [ ] 구성원 휴가 현황 목록이 카드형 또는 안전한 스크롤로 표시된다.
- [ ] 구성원 휴가 상세에서 글자 잘림이 없다.
- [ ] 엑셀 업로드 화면의 필터/버튼/요약 카드가 화면 밖으로 나가지 않는다.
- [ ] 업로드 미리보기 row가 모바일 카드로 읽힌다.
- [ ] 업로드 이력/상세 화면이 깨지지 않는다.
- [ ] Step-up dialog가 화면 밖으로 이탈하지 않는다.

## 실패 시 원칙

- 운영 DB 직접 수정 금지
- `prisma migrate reset` 금지
- 기존 LeaveRequest/LeaveLedger/LeaveAdjustment 삭제 금지
- 잘못 반영한 batch는 역조정 취소 또는 별도 수동 조정 이벤트로 처리
- 실제 엑셀 원본 대신 batchId, row 번호, 오류 메시지만 공유
