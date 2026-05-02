# LeaveLedger 휴가 장부 가이드

## 목적

LeaveLedger는 직원별 휴가 잔여가 왜 그 숫자인지 추적하기 위한 장부입니다. 기존 `LeaveAdjustment`, `LeaveGrant`, `LeaveRequest`는 그대로 유지하고, 각 상태 변화가 발생할 때 장부 이벤트를 함께 남깁니다.

## 이벤트 종류

- `GRANTED`: 연차 자동 부여 또는 맞춤휴가 지급
- `PENDING`: 휴가 요청 생성으로 승인 대기 수량 임시 차감
- `USED`: 승인 완료로 사용 확정
- `WITHDRAWN`: 직원 철회로 대기 차감 복구
- `REJECTED`: 반려로 대기 차감 복구
- `CANCELLED`: 승인 취소로 사용 수량 복구
- `ADJUSTED`: OWNER 수동 조정
- `EXPIRED`: 만료 소멸
- `REVOKED`: 맞춤휴가 지급 회수
- `CARRIED_OVER`: 이월

## 계산 방식

장부의 `amount`는 양수로 저장합니다. 증감 방향은 `eventType`으로 해석합니다.

- `GRANTED`, `CARRIED_OVER`: 부여와 잔여 증가
- `ADJUSTED`: `metadata.signedAmount` 기준으로 잔여 증가 또는 감소
- `PENDING`: 대기 증가, 잔여 감소
- `USED`: 사용 증가, 대기 감소
- `WITHDRAWN`, `REJECTED`: 대기 감소, 잔여 증가
- `CANCELLED`: 사용 감소, 잔여 증가
- `EXPIRED`, `REVOKED`: 잔여 감소

## 기존 모델과의 관계

- `LeaveAdjustment`: 생성 시 `ADJUSTED` 장부를 남깁니다.
- `LeaveGrant`: 생성 시 `GRANTED`, 회수 시 `REVOKED` 장부를 남깁니다.
- `LeaveRequest`: 요청 시 `PENDING`, 승인 시 `USED`, 반려/철회/취소 시 복구 이벤트를 남깁니다.
- `LeaveBalance`: 이번 단계에서는 제거하지 않고 기존 화면 호환을 위해 유지합니다. 장기적으로는 LeaveLedger 계산 결과의 캐시로 전환할 수 있습니다.

## 운영 스크립트

기존 데이터로 장부를 재구성합니다.

```bash
pnpm leave:ledger:rebuild
```

개발 환경에서만 기존 장부를 삭제하고 다시 만들 수 있습니다.

```bash
pnpm leave:ledger:rebuild -- --reset
```

정합성을 점검합니다.

```bash
pnpm leave:ledger:validate
```

검증은 음수 잔여/대기/사용 수량, `LeaveGrant` 저장 수량과 장부 계산 결과 차이를 확인합니다. 자동 수정은 하지 않습니다.

## 화면

- 직원: `/leaves/me`에서 내 휴가 장부 최신 이력을 확인합니다.
- OWNER: `/admin/leaves/history`에서 전체 직원 휴가 장부를 조회합니다.

## 주의사항

- 장부 중복 생성을 막기 위해 `idempotencyKey`를 사용합니다.
- 운영 DB에서 rebuild를 실행하기 전 백업을 권장합니다.
- 정합성 오류가 발견되면 직접 DB를 수정하지 말고 원인 요청/지급/조정 데이터를 먼저 확인해야 합니다.
- 향후 `leave:ledger:validate` 오류 발생 시 OWNER 관리자 알림을 생성하는 기능을 추가할 예정입니다.
# 연차 소멸 이벤트

연차 소멸 job은 소멸 대상 잔여 연차가 있을 때 `LeaveLedger.eventType = EXPIRED`, `source = ANNUAL_AUTO` 이벤트를 생성한다.

사용계획 제출은 실제 휴가 요청이 아니므로 장부 수량을 바꾸지 않는다. 장부 수량 변화는 휴가 요청/승인/반려/취소, 수동 조정, 맞춤휴가 지급/회수, 연차 소멸에서만 발생한다.

소멸 이벤트는 `expire:userId:annual:referenceYear:expirationDate` 형식의 idempotencyKey로 중복 생성을 방지한다.
