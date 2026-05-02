# 휴가 증명자료 제출 및 검수 가이드

휴가 증명자료 기능은 휴가 유형별 정책에 따라 직원이 자료를 제출하고, OWNER 또는 담당 LEAD가 안전하게 확인할 수 있도록 돕습니다. 증명자료에는 민감정보가 포함될 수 있으므로 public 폴더에 저장하지 않고, 다운로드 전 서버 권한 검사를 수행합니다.

## 1. 증명자료 정책

- `NOT_REQUIRED`: 증명자료가 필요 없습니다.
- `OPTIONAL`: 직원이 선택적으로 제출할 수 있습니다.
- `REQUIRED_BEFORE_REQUEST`: 휴가 요청 생성 전에 증명자료가 필요합니다. 첨부가 없으면 요청할 수 없습니다.
- `REQUIRED_AFTER_REQUEST`: 요청은 만들 수 있지만 요청 후 제출 필요 상태로 표시됩니다.

## 2. 직원 제출 방법

1. `/leaves/me/requests/new`에서 휴가를 요청합니다.
2. 요청 전 필수 제출 유형은 요청 form에서 파일을 첨부합니다.
3. 요청 후 제출 유형은 요청 상세 `/leaves/me/requests/{requestId}`에서 자료를 추가 제출합니다.
4. 반려 또는 재제출 요청을 받은 경우 같은 상세 화면에서 새 자료를 제출합니다.

사용계획 제출과 증명자료 제출은 별개입니다. 증명자료 제출은 실제 휴가 요청과 연결됩니다.

## 3. 승인권자 검수 방법

1. OWNER 또는 담당 LEAD가 `/leaves/approvals/{requestId}`에 접속합니다.
2. 증명자료 섹션에서 제출 상태와 파일 목록을 확인합니다.
3. 인증된 다운로드 route를 통해 파일을 확인합니다.
4. 검수 결과에 따라 확인 완료, 반려, 재제출 요청 중 하나로 처리합니다.
5. 반려 또는 재제출 요청 시 직원에게 전달할 사유를 입력합니다.

휴가 승인 정책에서 “증명자료 확인 후 승인”이 켜져 있으면 증명자료 상태가 `ACCEPTED`가 되기 전까지 휴가 승인 자체가 차단됩니다. 꺼져 있으면 승인 화면에 경고만 표시하고 기존 승인 흐름을 유지합니다.

## 4. 파일 보안 원칙

- 파일은 `public/`에 저장하지 않습니다.
- 개발 환경 기본 저장소는 `private/uploads/leave-attachments`입니다.
- 저장 파일명은 임의 key를 사용하며 원본 파일명은 표시용 metadata로만 보관합니다.
- 다운로드는 `/api/leave-attachments/{attachmentId}/download` route에서 인증과 권한 검사를 거친 뒤 제공합니다.
- 내부 `fileKey`, private path, 파일 내용은 화면과 AuditLog에 노출하지 않습니다.

## 5. 허용 파일과 크기

허용 형식:

- PDF
- JPG/JPEG
- PNG
- WEBP
- DOC
- DOCX

기본 최대 크기는 10MB입니다. 운영 환경에서는 `MAX_LEAVE_ATTACHMENT_SIZE_MB`로 조정할 수 있습니다.

## 6. 접근 권한

- 직원: 자기 휴가 요청의 증명자료만 조회/제출할 수 있습니다.
- OWNER: 전체 휴가 요청의 증명자료를 조회/검수할 수 있습니다.
- LEAD: 담당 팀과 하위 팀 직원의 요청 증명자료만 조회/검수할 수 있습니다. 자기 요청은 검수할 수 없습니다.
- MANAGER: 자기 자료만 접근할 수 있습니다.
- EXTERNAL_PARTNER와 비로그인 사용자는 접근할 수 없습니다.

## 7. AuditLog

다음 이벤트를 기록합니다.

- `LEAVE_ATTACHMENT_UPLOADED`
- `LEAVE_ATTACHMENT_DOWNLOADED`
- `LEAVE_ATTACHMENT_ACCEPTED`
- `LEAVE_ATTACHMENT_REJECTED`
- `LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED`
- `LEAVE_ATTACHMENT_DELETED`

AuditLog에는 파일 내용, private path, fileKey, 진단서 내용 같은 민감 원문을 저장하지 않습니다.

## 8. Notification

다음 상황에서 인앱 알림을 생성합니다.

- 증명자료 확인 완료
- 증명자료 반려
- 증명자료 재제출 요청
- 요청 후 제출 필요 안내

이메일, 카카오톡, Slack 알림은 후순위입니다.

## 9. 운영 TODO

- S3/GCS/Azure Blob 같은 외부 private storage 연동
- 바이러스 검사 도입
- 보존 기간과 삭제 정책 확정
- 증명자료 전체 관리 화면 고도화
- 승인 전 제출 필수 정책의 휴가 유형별 세분화
