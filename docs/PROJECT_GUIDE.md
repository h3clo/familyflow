# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 구조 복원: `docs/ARCHITECTURE.md`. 주제 상세는 링크로만 연다 (내용을 여기 복제하지 않는다).

## 현재 시작점 (2026-11-10 Asia/Seoul)

**방금 완료(배포):** PR #4 머지·Pages 재배포 — 미로그인 시 로그인/가입 우선, 가입 시 집 이름 → `create_household`.  
번들 문자열·단위 테스트로 확인. 실계정 E2E 가입은 미실시.

**지금 작업:** 문서 방향 복원 (코드/UI/DB/배포 설정 변경 없음). 브랜치 `cursor/docs-restore-c704`.  
신규·보완: ARCHITECTURE · DESIGN_SYSTEM · handoff-history · DECISIONS · 본 가이드 · README/설정 문서 구식 문구.

**다음 행동 (한 가지):** 문서 PR 리뷰·병합 승인 대기. UX A/B/C·4탭 IA·토큰 확정·구현은 별도 승인 전 금지.

작업 기준 브랜치: 평소 `main`. 이번 문서 작업만 위 feature 브랜치.

## 구현 완료 (코드에 존재)

| 영역 | 상태 | 상세 |
| --- | --- | --- |
| S1 규칙 홈 제안 | 구현 | [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md) |
| S2 ActionProposal | 구현 | [ACTION_PROPOSAL.md](ACTION_PROPOSAL.md) |
| S3 Ollama provider | 구현 | [AI_PROVIDER.md](AI_PROVIDER.md) |
| S4 한국어 대화→proposal | 구현 | 동상 |
| S5-A 공용 계정·가구·RLS | 구현 | [SUPABASE_SETUP.md](SUPABASE_SETUP.md) |
| S5-A′ 초대 UI 기본 숨김 | 구현 | PRODUCT_DIRECTION |
| S5-B 다기기 sync·프로필 | 구현 | [S5B_SYNC.md](S5B_SYNC.md) |
| AI failover 로컬패턴→Ollama→Groq→규칙 | 구현 | [AI_FAILOVER.md](AI_FAILOVER.md) |
| Auth-first 온보딩·가입 시 가구 생성 | 구현·Pages 배포 | [DECISIONS.md](DECISIONS.md) §2, `src/cloud/onboarding.js` |

로컬: `npm run dev` → `http://127.0.0.1:5174/`  
자동화: 커밋 전 `npm test` · `npm run build`로 **그 시점** 결과를 확인한다 (개수를 문서에 고정하지 않음).  
문서 작성 시점 참고: `npm test` 61 pass (2026-11-10, main@28fad91 기준).

## 검증됨 vs 미검증

### 검증됨 (기록 있는 범위)

- 단위/통합: 온보딩 포함 `npm test` 통과 기록 (위 참고 시점).
- Edge `ai-complete` 스크립트 스모크(과거): 인증 200·`paidUpgrade:false`, 401/403, Ollama offline→Groq→proposal→apply — [AI_FAILOVER.md](AI_FAILOVER.md).
- Pages HTML/JS 공개 배포 및 온보딩 UI 문자열·`create_household` 존재 확인 (2026-11-10).

### 미검증 · 완료로 쓰지 말 것

- 실기기(Mac/iPhone/iPad) 다기기 동기화 사용자 수용.
- 신규 실계정으로 Pages에서 가입→가구명 E2E (데이터 생성 회피로 미실시).
- 사용자 Mac Ollama vs Cloud Agent VM Ollama는 **다른 loopback**.
- 운영 트래픽·쿼터 한도 압박 테스트.
- UX/UI 전면 재설계 **구현** (미승인).
- S5-C 오프라인 쓰기 큐, 패턴 학습 — **계획만**, 미구현.
- Haze 선택 연동 — **장기 검토만**, 미구현.

## 현재 승인된 결정

포인터만 — 본문은 [DECISIONS.md](DECISIONS.md):

- 가족 중심 가정 운영 도우미
- 공용 관리자 계정 1개 + 가족 프로필
- Haze: **현재 분리 운영** + **장기 선택 연동은 검토만**
- ActionProposal 승인 후에만 저장
- AI: 로컬패턴 → Ollama → Groq(무료 Edge) → 규칙 (NIM ≠ 현재 경로)
- Auth-first + 가입 시 집 이름
- UX 시안/4탭/토큰: **미승인**

## 작업 대기열

### P0 (지금)

1. ~~Pages·온보딩 배포~~ → **완료** (`28fad91`)
2. **문서 방향 복원 PR** (본 브랜치) — 병합 승인 대기
3. UX 방향·토큰 사용자 승인 대기 (UI 코드 금지 유지)

### P1 (승인 후)

- UX 재설계 **단계적** 구현 (승인된 방향·범위만). 초안 순서 제안만 존재 — 확정 전 코드 금지.
- computerUse 기본 금지 (`AGENTS.md`).

### P2 (별도 승인)

- S5-C 오프라인 쓰기 큐
- 멤버별 Auth, 건강/가계 등 신규 도메인
- Haze 등 외부 선택 연동 설계

## 주제 문서 링크

- [아키텍처](ARCHITECTURE.md) · [디자인 원칙/미확정](DESIGN_SYSTEM.md) · [인계 이력](handoff-history.md)
- [제품 방향](PRODUCT_DIRECTION.md) · [결정 로그](DECISIONS.md)
- [ActionProposal](ACTION_PROPOSAL.md)
- [AI Provider](AI_PROVIDER.md) · [AI Failover](AI_FAILOVER.md)
- [Supabase 설정](SUPABASE_SETUP.md) · [S5-B Sync](S5B_SYNC.md)

## 작업 종료 시 갱신 규칙

1. **현재 시작점**을 “방금 한 일 / 다음 행동 한 줄”로 바꾼다.
2. 완료한 항목은 대기열에서 제거하고, 미검증은 검증됨으로 올리지 않는다.
3. 새로 **확정된** 제품·기술 결정만 `DECISIONS.md`에 추가한다 (시안·가설 금지).
4. 긴 과정은 `docs/handoff-history.md`에 남긴다.
5. 비밀·토큰·개인 데이터를 기입하지 않는다.
6. 문서만 바꾼 경우, 테스트 개수·배포 성공으로 코드 변경을 과장하지 않는다. 개수는 “참고 시점”으로만 적거나 `npm test`를 다시 돌리라고 안내한다.
