# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 구조 복원: `docs/ARCHITECTURE.md`. 주제 상세는 링크로만 연다.

## 현재 시작점 (2026-11-11 Asia/Seoul)

**방금 완료:** 네이버 주문 붙여넣기 → 재고(#42) 머지·배포.

**지금 작업:** 가족 취향 메모 UI (좋아함/싫어함 태그 입력).

**다음 행동 (한 가지):** 가족 탭에서 메모 저장 → 저녁 추천 반영 확인 후 머지.

작업 기준 브랜치: 평소 `main`.  
배포: https://h3clo.github.io/familyflow/

## 구현 완료 (코드에 존재)

| 영역 | 상태 | 상세 |
| --- | --- | --- |
| S1–S5-B · AI failover · auth-first | 배포 | 기존 문서 |
| 클라우드 자동 연결 | 배포 | PR #10 |
| Dinner ranking v2 · 확인 후 재고 등록 | 배포 | PR #11 |
| 샤브·스타터 단백질·사진 단위 바꾸기 | 배포 | PR #38 |
| UI/비주얼(토큰 미확정) | 배포 | dinner 에셋 |
| Pages SW 캐시 | 배포 | #18 network-first · PWA `build.json` 자동 갱신 |
| `?sandbox&device=` 저장 격리 | 배포 | `src/lib/storageScope.js` |
| 네이버페이 주문 붙여넣기 → 재고 | 배포 | #42 · `orderPaste.js` · DECISIONS §8 |

## 검증됨 vs 미검증

### 검증됨
- 단위 테스트 · Pages 스모크(격리 프로필) — 기존 기록
- CI **live-supabase-qa** (격리 QA 계정 push/pull·RLS) — Actions
- sandbox 키 접두사 단위 테스트 (`tests/storage-scope.test.js`)

### 미검증
- **운영 공용 계정** 로그인·다기기 (의도적 미실시)
- 체크리스트 **B열** 수동 브라우저 2대 E2E
- 신규 실계정 가입 E2E(운영)
- 최종 비주얼 토큰 동결
- computerUse GUI 영상 스모크

## 현재 승인된 결정

포인터 — [DECISIONS.md](DECISIONS.md): ActionProposal, auth-first, 홈 저녁 §6.1 · ranking v2 · sandbox URL 격리 · 주문 붙여넣기 §8.
비주얼 팔레트·타이포 **미확정**.

## 작업 대기열

### P0
_(비어 있음)_

### P1 (다음 개발 후보 — 승인 후)
1. ~~실계정·다기기 동기화 점검 체크리스트/수정~~ → 체크리스트 추가 · B열 수동은 미검증
2. ~~테스트용 `?sandbox&device=` 저장 키 격리~~ → 구현
3. ~~가족 취향 전용 필드 **또는** 한 끼 예산 배지~~ → 취향은 **note 태그 + 가족 탭 UI**(전용 컬럼 없음). 한 끼 예산 배지는 홈 금지·보류

### P2
- S5-C, 멤버별 Auth, Haze 연동 설계
- 비주얼 토큰 동결

## 주제 문서 링크

- [아키텍처](ARCHITECTURE.md) · [디자인 원칙/미확정](DESIGN_SYSTEM.md) · [인계 이력](handoff-history.md)
- [제품 방향](PRODUCT_DIRECTION.md) · [결정 로그](DECISIONS.md)
- [ActionProposal](ACTION_PROPOSAL.md) · [AI Provider](AI_PROVIDER.md) · [AI Failover](AI_FAILOVER.md)
- [Supabase 설정](SUPABASE_SETUP.md) · [S5-B Sync](S5B_SYNC.md) · [Sync E2E 체크리스트](SYNC_E2E_CHECKLIST.md)

## 작업 종료 시 갱신 규칙

1. **현재 시작점**을 “방금 한 일 / 다음 행동 한 줄”로 바꾼다.
2. 미검증은 검증됨으로 올리지 않는다.
3. 확정 결정만 `DECISIONS.md`에 추가한다.
4. 긴 과정은 `handoff-history.md`.
5. 비밀·개인 데이터 금지.
6. 테스트 개수를 고정 규칙처럼 쓰지 않는다.
