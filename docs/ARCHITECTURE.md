# Family Flow — Architecture

운영 상태: [PROJECT_GUIDE.md](PROJECT_GUIDE.md) · 확정 결정: [DECISIONS.md](DECISIONS.md) · 제품 방향: [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md)

이 문서는 **코드와 마이그레이션으로 확인된 구조**를 요약한다. 상세 스키마·정책은 주제 문서로 링크하고 여기 복제하지 않는다.

상태 라벨:

| 라벨 | 의미 |
| --- | --- |
| **구현됨** | `main` 코드/마이그레이션에 존재 |
| **제품 합의** | 사용자 승인·DECISIONS에 기록 |
| **미승인 제안** | 시안·IA 등, 구현 금지 |
| **장기 검토** | 가능성만 열어둠. 지금 구현하지 않음 |
| **확인 불가** | 과거 산출물/대화에 근거 없음 |

## 1. 시스템 개요 (구현됨)

Family Flow는 Vite 기반 SPA다.

- **프론트:** `src/` (바닐라 JS). 로컬 개발 `http://127.0.0.1:5174/`
- **저장:** 브라우저 로컬 + (로그인·이전 승인 후) Supabase를 `cloud-primary`로 사용
- **인증·DB·Realtime:** Family Flow 전용 Supabase 프로젝트
- **AI (선택):** 로컬 한국어 패턴 → Ollama(개발 프록시) → Edge `ai-complete`(Groq 무료) → 규칙/안내
- **배포:** GitHub Pages (`base` `/familyflow/`), 워크플로 `.github/workflows/pages.yml`

규칙 엔진·장보기·재고·식단은 AI 없이도 동작한다.

## 2. 프론트 모듈 맵 (구현됨)

| 영역 | 경로 | 역할 |
| --- | --- | --- |
| UI 셸 | `src/app.js`, `src/main.js` | 탭·홈·클라우드 패널·승인 UI |
| 도메인 | `src/domain/*` | shopping / inventory / meals / proposals / suggestions |
| 클라우드 | `src/cloud/*` | auth, households, sync, onboarding, migratePlan |
| AI | `src/ai/*` | localIntent, ollama, groq, router, conversation |
| 저장 | `src/lib/storage.js` | 로컬 저장 |

탭(현재 구현): **홈 · 장보기 · 재고 · 식단 · 더보기**.  
검토 중인 다른 IA는 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (미승인).

## 3. 데이터 모델 (구현됨)

Supabase 마이그레이션 `supabase/migrations/`:

- `households`, `household_members`
- `shopping_lists`, `shopping_items`
- `inventory_items`
- `profiles`, `household_invites`
- `meal_plans`, `today_dinners`
- `family_profiles` (S5-B)
- `ai_usage_events` + 쿼터 RPC (Edge용)

공유 행은 `household_id` 기준. RLS·RPC 요약: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).  
동기화·오프라인: [S5B_SYNC.md](S5B_SYNC.md).

앱 개념 구분 (제품 합의):

- **Auth 계정** ≠ **가구(household)** ≠ **가족 프로필**
- 기본은 공용 관리자 계정 1개 + 프로필. 전원 가입 강제가 아니다.

## 4. 인증 · 온보딩 (구현됨 · 제품 합의)

클라우드가 설정되고 미로그인이면 탭 대신 로그인/가입 게이트를 먼저 보인다 (`needsCloudAuthGate`).  
「로컬로만 먼저 둘러볼게요」로 우회 가능.

가입 시 **집 이름**은 프로필 `display_name`이 아니라 `create_household`로 가구를 만든다 (`parseSignupHouseholdName`).  
프로필 표시명은 기본 `관리자`.

코드: `src/cloud/onboarding.js`, `src/cloud/auth.js`, `src/cloud/households.js`, `src/app.js`.  
결정: [DECISIONS.md](DECISIONS.md) §2.

## 5. 변경 저장 경로 (구현됨 · 제품 합의)

규칙·AI는 도메인을 직접 쓰지 않는다.

1. 요청 해석 (규칙 또는 대화)
2. `ActionProposal` 생성·검증
3. `previewProposal` (clone만)
4. 사용자 승인
5. `applyProposal` (원자·idempotent)
6. cloud-primary면 동기화 푸시

상세: [ACTION_PROPOSAL.md](ACTION_PROPOSAL.md).

## 6. AI 처리 흐름 (구현됨)

런타임 순서 (`src/ai/router.js`, `conversation.js`):

1. 한국어 **로컬 고신뢰 패턴** (`localIntent.js`)
2. **Ollama** — Vite `/api/ollama` → loopback. **GitHub Pages에는 프록시 없음**
3. Ollama 불가 시 Edge **`ai-complete` → Groq 무료** (JWT·가구·쿼터). 유료 업셀 없음
4. 실패 시 **규칙/안내**

모델 JSON은 신뢰하지 않는다. op 화이트리스트·`normalizeAiOp`·proposal 검증 후 미리보기.

| 기술 | 상태 |
| --- | --- |
| 로컬 패턴 / Ollama / Groq Edge / 규칙 | **현재 운영 경로 (구현됨)** |
| NVIDIA NIM | 코드 주석·과거 문서에만 언급. **런타임 어댑터·호출 경로 없음** (장기/과거 검토로만 취급) |

상세: [AI_PROVIDER.md](AI_PROVIDER.md), [AI_FAILOVER.md](AI_FAILOVER.md).

## 7. 배포 (구현됨)

- URL: `https://h3clo.github.io/familyflow/`
- 클라이언트: `.env.production`의 publishable/anon만. `service_role`·`GROQ_API_KEY` 금지
- Auth Site/Redirect URL은 대시보드에서 Pages·로컬에 맞춤 ([SUPABASE_SETUP.md](SUPABASE_SETUP.md))

## 8. 외부 서비스 연동 (장기 검토)

**현재 (제품 합의·운영):** Haze Flow와 저장소·Supabase·배포·로컬 포트를 분리한다. 이 Agent는 Haze 코드를 읽거나 수정하지 않는다.

**장기 검토 (미구현):** 가계·생활비·운동·건강 등 관련 데이터를 **선택적으로** 연결할 가능성은 아키텍처상 열어 둔다.  
연동 시점·범위·권한·동기화 방식은 미정. **공통 DB·계정 통합을 지금 구현하지 않는다.**

앱 UI의 「가정 재정 · Haze 연동」 등은 잠금/향후 표시이며 동작 구현이 아니다.

## 9. 의도적 비범위 / 미구현

| 항목 | 상태 |
| --- | --- |
| S5-C 오프라인 쓰기 큐 | 계획만 · 미승인 |
| 멤버별 Auth를 기본 UX로 | 미채택 (초대는 선택) |
| 전면 UI 재설계·디자인 토큰 확정 | 미승인 ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)) |
| 가족 일정·가사 분담·건강·가계 도메인 | 장기 구상 · 미구현 |
| Haze 실연동 | 장기 검토 · 미구현 |
| Pages에서 Ollama | 불가(프록시 없음). 로컬 개발 전제 |

## 10. 문서 연결

새 세션 복원 순서: `AGENTS.md` → `PROJECT_GUIDE.md` → `DECISIONS.md` → (필요 시) 본 파일·주제 docs.
