# 관리자 리포트 가이드

## 목적

관리자 리포트는 OWNER가 휴가, 인사, 온보딩, 증명자료 운영 현황을 확인하고 필요한 데이터를 CSV로 안전하게 내보내기 위한 기능이다.

이번 단계는 내부 관리자 화면과 CSV 다운로드까지만 제공한다. 외부 BI 연동, XLSX/PDF 생성, 예약 발송, 이메일 발송은 후순위다.

## 제공 리포트

- 휴가 사용 현황: 휴가 요청 기간, 상태, 승인자, 증명자료 상태를 확인한다.
- 휴가 장부: LeaveLedger 기준 부여, 대기, 사용, 조정, 소멸, 회수 이력을 확인한다.
- 맞춤휴가 지급: LeaveGrant 기준 지급 수량, 사용 수량, 잔여 수량, 상태를 확인한다.
- 생일 반차 지급: BIRTHDAY_AUTO 지급 결과와 사용 가능 기간을 확인한다.
- 연차 촉진·사용계획: 촉진 알림, 소멸 예정 수량, 사용계획 제출 상태를 확인한다.
- 증명자료 제출 현황: 제출 파일의 검토 상태와 재제출 요청 여부를 확인한다.
- 직원 온보딩 현황: prejoin profile, 초대 연결, 가입 연결, 프로필 확인 완료 여부를 확인한다.
- 직원 프로필 확인 현황: 직원별 정보 확인과 수정 요청 개수를 확인한다.

## 접근 권한

- OWNER만 `/admin/reports`와 하위 리포트에 접근할 수 있다.
- LEAD, MANAGER, EXTERNAL_PARTNER는 접근할 수 없다.
- CSV export route도 서버에서 OWNER 권한을 다시 검증한다.

## CSV 내보내기

각 리포트 화면의 `CSV 내보내기` 버튼은 현재 필터를 유지한 상태로 CSV를 내려받는다.

CSV는 한국어 Excel 호환을 위해 UTF-8 BOM을 포함한다. 쉼표, 따옴표, 줄바꿈은 CSV 규칙에 맞게 escape한다.

## 민감정보 보호

CSV export는 리포트별 allowlist 컬럼만 내보낸다. 다음 값은 export하지 않는다.

- 주민등록번호와 외국인등록번호 원문
- 가족 주민등록번호 원문
- 계좌번호 원문
- passwordHash
- session token과 tokenHash
- invitation token과 tokenHash
- fileKey
- private file path와 내부 storage 경로
- 증명자료 파일 내용
- AuditLog metadata 전체
- 급여/보상 계약 상세 원문

전화번호는 HR 온보딩 리포트에서 마스킹한다. 생일 반차 리포트는 생년월일 전체 대신 월/일만 표시한다.

## CSV Injection 방어

CSV 값이 `=`, `+`, `-`, `@`로 시작하면 앞에 `'`를 붙여 스프레드시트 수식 실행을 방지한다.

## AuditLog

CSV export가 실행되면 `REPORT_EXPORTED` AuditLog가 기록된다.

metadata에는 다음만 저장한다.

- reportType
- exportedByUserId
- filterSummary
- rowCount
- exportedAt

CSV 본문과 민감정보는 AuditLog에 저장하지 않는다.

## 운영 주의사항

- 화면 조회는 최대 100건을 표시한다.
- CSV export는 현재 최대 5,000건까지 내려받는다.
- 대량 export streaming, 비동기 export, 예약 발송은 후순위 고도화다.
- 증명자료 리포트에는 fileKey, 다운로드 URL, private path가 포함되지 않는다.
- 연차 촉진 리포트는 운영 참고용이며 실제 법무/노무 판단은 별도 검토가 필요하다.

## 자동 확정 휴가 반영

미승인 휴가 자동 확정으로 `APPROVED` 처리된 요청은 일반 승인 완료 휴가와 같이 휴가 사용 현황 리포트와 장부 리포트에 반영된다. 장부 리포트에서는 source가 `LEAVE_AUTO_CONFIRM`으로 표시된다.
