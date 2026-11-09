# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 구조 복원: `docs/ARCHITECTURE.md`. 주제 상세는 링크로만 연다 (내용을 여기 복제하지 않는다).

## 현재 시작점 (2026-11-10 Asia/Seoul)

**방금 완료:**
- PR **#4** — auth-first 온보딩·가입 시 집 이름 → `create_household` (Pages 배포됨)
- PR **#5** — 문서 방향 복원. merge `7891dcd`
- Pages 스모크(실계정 없음): 접속·로그인 우선·로컬 둘러보기·집 이름 필드·모바일·콘솔 주요 오류 없음 확인. 신규 가입 E2E는 **미검증** 유지.
- UX A/B/C(+D 하이브리드) **시안 제안** (앱 UI 미변경 · 미승인)

**지금 작업:** PR 자동 CI + 가이드 갱신 — 브랜치 `cursor/ci-and-guide-c704` / PR **#6** (CI 통과, **병합 승인 대기**).

**다음 행동 (한 가지):** PR #6 병합 여부 승인. 이어서 UX 방향(A/B/C/D)·내비·AI 진입 선택. **구현·토큰 확정은 별도 승인.**

작업 기준 브랜치: 평소 `main`.

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
| AI failover 로컬패턴→Ollama→Groq→규칙 | 구현 | [AI_FAILOVER.md](AI_FAILOVER.md) · 환경별 경로 [ARCHITECTURE.md](ARCHITECTURE.md) §6 |
| Auth-first 온보딩·가입 시 가구 생성 | 구현·Pages 배포 | [DECISIONS.md](DECISIONS.md) §2 |
| 운영 문서 세트 | 문서 | ARCHITECTURE · DESIGN_SYSTEM · handoff-history 등 (PR #5) |

로컬: `npm run dev` → `http://127.0.0.1:5174/`  
공개: https://h3clo.github.io/familyflow/  
자동화: 커밋 전 `npm test` · `npm run build`. 통과 개수는 문서에 고정하지 않는다.

## 검증됨 vs 미검증

### 검증됨 (기록 있는 범위)

- 단위/통합: 온보딩 헬퍼 포함 `npm test` 통과 기록 (참고 시점 있음; 재실행으로 확인).
- Edge `ai-complete` 스크립트 스모크(과거): [AI_FAILOVER.md](AI_FAILOVER.md).
- Pages 배포·온보딩 UI 문자열·`create_household` 번들 존재 (2026-11-10).
- PR #5 문서 병합·Pages 재배포 성공 (`7891dcd`).
- Pages 스모크(2026-11-10): 하드 리프레시 후 `index-CknnDdcD.js` 200, auth-first, 로컬 둘러보기, 집 이름 필드, 모바일 레이아웃, 콘솔 주요 오류 없음.
- PR #6 CI `test-and-build` SUCCESS (이 브랜치, 병합 전).

### 미검증 · 완료로 쓰지 말 것

- 신규 실계정으로 Pages 가입→가구명 E2E (운영 데이터 회피 — **의도적 미실시**). 단위/`create_household` 경로만 코드·테스트로 확인.
- 실기기(Mac/iPhone/iPad) 다기기 동기화 사용자 수용.
- 운영 트래픽·쿼터 한도 압박.
- UX/UI 전면 재설계 **구현** (시안 제안됨 · **미승인**).
- S5-C 오프라인 쓰기 큐, 패턴 학습 — 계획만.
- Haze 선택 연동 — 장기 검토만.
- 중간 CDN/캐시로 옛 번들 404가 잠깐 보인 사례 — 하드 리프레시로 해소. 재발 모니터링만.

## 현재 승인된 결정

포인터 — [DECISIONS.md](DECISIONS.md):

- 가족 중심 가정 운영 도우미
- 공용 관리자 계정 1개 + 가족 프로필
- Haze: 현재 분리 + 장기 선택 연동은 검토만
- 건강·금융 등은 **현재** 저장 금지 · 확장은 **별도 승인**
- ActionProposal 승인 후에만 저장
- AI: 로컬패턴 → Ollama(dev) → Groq(로그인 시) → 규칙
- Auth-first + 가입 시 집 이름
- UX 시안/IA/토큰: **미승인**

## 작업 대기열

### P0 (지금)

1. ~~문서 방향 복원 PR #5~~ → **완료**
2. ~~Pages 스모크(실계정 없이)~~ → **완료** (가입 E2E는 미검증)
3. ~~UX A/B/C 시안 제안~~ → **제시됨 · 선택 대기** (구현 금지)
4. **PR #6 CI + 가이드** — 병합 승인 대기

### P1 (승인 후)

- UX 방향·내비·AI 진입 선택 후 **단계적** 구현 (승인 범위만)
- 이메일 자동확인 → SMTP 검증 전환 검토 ([SUPABASE_SETUP.md](SUPABASE_SETUP.md))

### P2 (별도 승인)

- S5-C 오프라인 쓰기 큐
- 멤버별 Auth·감사 추적
- 건강/가계 도메인, Haze 선택 연동 설계

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
6. 문서만 바꾼 경우 테스트 개수·배포 성공으로 코드 변경을 과장하지 않는다.
