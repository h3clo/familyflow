# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 주제 상세는 아래 링크로만 연다 (내용을 여기 복제하지 않는다).

## 현재 시작점 (2026-11-10 Asia/Seoul)

**방금 완료:** 로컬 tip을 GitHub `h3clo/familyflow`에 **force 없이** 보존 push함.  
- `origin/cursor/ai-failover-normalize-fbf0` → `676a43e`  
- `origin/cursor/ops-docs-p0-fbf0` → `5c91334` (조상에 AI failover `676a43e` 포함)  
- 로컬 `main` tip `178f90f`는 원격에 **아직 없음** (`origin/main`은 무관 Initial `a5c0265`). **main push/병합·force 금지** (별도 승인 전).

**다음 행동 (한 가지):** 사용자가 UX/UI 재설계 **방향(A/B/C 또는 혼합)을 승인**할 때까지 UI 코드를 수정하지 않는다.  
승인 전에는 가이드·결정 문서 보완이나, 승인된 범위의 비UI 버그/문서만 다룬다. 홈 구현 착수 금지.

브랜치 참고: 작업 tip은 `cursor/ops-docs-p0-fbf0` (`5c91334`+). Cloud/로컬 모두 이 브랜치를 기준으로 이어서 연다.

## 구현 완료 (코드에 존재)

| 영역 | 상태 | 상세 |
| --- | --- | --- |
| S1 규칙 홈 제안 | 구현 | `docs/PRODUCT_DIRECTION.md` |
| S2 ActionProposal | 구현 | `docs/ACTION_PROPOSAL.md` |
| S3 Ollama provider | 구현 | `docs/AI_PROVIDER.md` |
| S4 한국어 대화→proposal | 구현 | 동상 |
| S5-A 공용 계정·가구·RLS | 구현 | `docs/SUPABASE_SETUP.md` |
| S5-A′ 초대 UI 기본 숨김 | 구현 | PRODUCT_DIRECTION |
| S5-B 다기기 sync·프로필 | 구현 | `docs/S5B_SYNC.md` |
| AI failover Ollama→Groq→규칙 | 구현 | `docs/AI_FAILOVER.md` |
| `normalizeAiOp` (shopping.add 보정) | 구현 | conversation + AI_FAILOVER |

로컬: `npm run dev` → `http://127.0.0.1:5174/`  
자동화: `npm test` (59) · `npm run build` — 문서 작성 시점 기준 통과 기록 있음.

## 검증됨 vs 미검증

### 검증됨 (기록 있는 범위)

- 단위/통합: `npm test` 59 pass, `npm run build` ok (AI failover·normalize 포함 시점).
- Edge `ai-complete` 스크립트 스모크: 인증 200·`paidUpgrade:false`, 401/403 경로, Ollama offline→Groq→proposal→apply (휴지 1롤) — `docs/AI_FAILOVER.md` 검증 절.
- Proposal 파이프라인·로컬 의도·sync 헬퍼: 테스트 파일로 커버.

### 미검증 · 완료로 쓰지 말 것

- 실기기(Mac/iPhone/iPad) 다기기 동기화 사용자 수용.
- 사용자 Mac의 Ollama와 Cloud Agent VM Ollama는 **다른 loopback** (`AI_PROVIDER.md`).
- 공개 배포(Pages)·운영 트래픽·쿼터 한도 압박 테스트.
- UX/UI 전면 재설계 **구현** (시안만 제시, **디자인 방향 미승인**).
- S5-C 오프라인 쓰기 큐, 패턴 학습 — **계획만**, 미구현.

## 현재 승인된 결정

요약본은 `docs/DECISIONS.md`. 여기서는 포인터만:

- 공용 관리자 계정 1개 + 가족 프로필
- Haze와 DB/코드/계정 분리
- ActionProposal 승인 후에만 저장
- Ollama → Groq(무료 Edge) → 규칙, 유료 업셀 금지
- UX 재설계: **시안 제시까지**, 구현 승인 **대기**

## 작업 대기열

### P0 (지금)

1. ~~운영 문서 최소 세트~~ → **완료**
2. ~~피처 브랜치 tip 원격 보존 (`676a43e` / `5c91334`)~~ → **완료**
3. UX 방향 사용자 승인 대기 (UI 코드 금지 유지)
4. (별도 승인) `main`을 `178f90f` 계열로 맞추는 전략 — force 금지·non-FF 주의

### P1 (승인 후)

- UX 재설계 **단계적** 구현 (승인된 방향·범위만). 제안 순서 초안: 토큰/쉘 → 홈 Focus+AI 시트 → 식생활 세그먼트 → 가족/설정 → 승인 카피. 세부 계획은 승인 직후 가이드에 확정.
- computerUse 기본 금지, 스크립트/sandbox 검증 (`AGENTS.md`).

### P2 (별도 승인)

- S5-C 오프라인 쓰기 큐
- GitHub remote/push·Pages 배포
- 멤버별 Auth, 건강/가계 등 신규 도메인

## 주제 문서 링크

- [제품 방향](PRODUCT_DIRECTION.md)
- [결정 로그](DECISIONS.md)
- [ActionProposal](ACTION_PROPOSAL.md)
- [AI Provider](AI_PROVIDER.md) · [AI Failover](AI_FAILOVER.md)
- [Supabase 설정](SUPABASE_SETUP.md) · [S5-B Sync](S5B_SYNC.md)

## 작업 종료 시 갱신 규칙

1. **현재 시작점**을 “방금 한 일 / 다음 행동 한 줄”로 바꾼다.
2. 완료한 항목은 대기열에서 제거하고, 미검증은 검증됨으로 올리지 않는다.
3. 새로 **확정된** 제품·기술 결정만 `DECISIONS.md`에 추가한다 (시안·가설 금지).
4. 긴 과정은 필요 시 `docs/handoff-history.md`에만 남긴다 (아직 없으면 만들지 않고 가이드만 갱신해도 된다).
5. 비밀·토큰·개인 데이터를 기입하지 않는다.
6. 코드 없이 문서만 바꾼 경우, 테스트 개수·배포 성공으로 과장하지 않는다.
