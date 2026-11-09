# ActionProposal 스키마 (S2)

규칙 엔진과 향후 Ollama/NIM AI는 **도메인 상태를 직접 바꾸지 않고** 이 JSON만 제출한다.  
앱은 `previewProposal` → 사용자 승인 → `applyProposal` 순으로만 저장한다.

## 객체 형태

```json
{
  "schemaVersion": 1,
  "id": "rules:shop-abc",
  "source": "rules | ai | test",
  "key": "optional-stable-key",
  "priority": 10,
  "title": "짧은 제목",
  "reason": "왜 이 변경이 필요한지",
  "actionLabel": "변경 미리보기",
  "sensitivity": "household",
  "ops": [{ "op": "shopping.add", "payload": {} }],
  "createdAt": "ISO-8601"
}
```

- `sensitivity: personal_health` 는 파이프라인에서 거부한다.
- `ops` 는 1~20개. 지원하지 않는 `op` 는 생성 시점에 실패한다.
- 같은 `id` 로 두 번 승인하면 두 번째는 idempotent no-op.

## 지원 op (화이트리스트)

| op | payload 요지 |
| --- | --- |
| `shopping.add` | `name`, `quantity`, `unit`, `priority`, `category`, optional `inventoryId`, `skipIfExists` |
| `shopping.remove_unchecked` | `name` (미체크 항목만 제거) |
| `inventory.set_status` | `id`, `status` (`enough`/`low`/`out`/`unknown`) |
| `inventory.upsert` | `name` + 재고 필드 |
| `meals.confirm_dinner` | `title`, `protein`, pattern/sauce ids |
| `meals.draft_week` | `{}` |
| `meals.confirm_week` | optional `planId` |
| `meals.replace_protein` | `from`, `to`, `scope` (`week`\|`today`) |

## 복합 예시 (닭고기 → 고등어)

요청: *이번 주 닭고기 메뉴를 고등어로 바꾸고, 고등어가 부족하면 장보기 목록에 추가해줘.*

```json
{
  "schemaVersion": 1,
  "source": "ai",
  "title": "닭고기 → 고등어 메뉴 변경",
  "reason": "이번 주 메뉴의 닭고기를 고등어로 바꾸고, 재고가 없으면 장보기에 넣습니다.",
  "ops": [
    { "op": "meals.replace_protein", "payload": { "from": "닭고기", "to": "고등어", "scope": "week" } },
    { "op": "shopping.add", "payload": { "name": "고등어", "quantity": 1, "unit": "마리", "priority": "must", "category": "food" } }
  ]
}
```

헬퍼: `buildProteinSwapWithShoppingProposal(state, { from, to })` — 재고가 충분하면 장보기 op를 생략한다.

## 보장

1. **미리보기**는 clone 위에서만 돌리고 원본 state를 바꾸지 않는다.
2. **적용**은 전 op 성공 후에만 domain slice를 복사한다 (부분 반영 없음).
3. 장보기 **중복 이름**(미체크)은 저장 전에 거절한다.
4. 거절/보류는 `suggestionsMeta.dismissed` 스누즈로 유지한다.
