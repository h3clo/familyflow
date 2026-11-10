# Family Flow — 확정 결정

**확정된 결정만** 적는다. 시안·가설·미승인 계획은 `PROJECT_GUIDE` 대기열·`DESIGN_SYSTEM.md`에 두고 여기 넣지 않는다.  
변경 시 날짜와 한 줄 이유를 남긴다.

관련: [ARCHITECTURE.md](ARCHITECTURE.md) · [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

## 1. Haze Flow와 Family Flow 역할

| | Family Flow | Haze Flow |
| --- | --- | --- |
| 중심 | **우리 집** 가정 운영 | **나**의 운동·루틴·기록 |
| 저장소 | `h3clo/familyflow` (이 저장소만 작업) | 별도 저장소 — **승인 없이 읽기·수정 금지** |
| 클라우드 | Family Flow 전용 Supabase | 별도 프로젝트 (현재 공유 금지) |
| 로컬 포트 | `5174` | Haze 기본과 분리 |

**현재 운영 (확정):** 독립 개발·배포. Family Flow는 Haze 코드·DB를 재사용하지 않는다.

**장기 검토 (미구현·미승인 연동):** 가계·생활·건강 등 데이터가 나중에 **선택적으로** 연결될 가능성은 아키텍처 검토 항목으로만 남긴다. 공통 DB·계정 통합을 지금 구현하지 않는다. 상세 문구: [ARCHITECTURE.md](ARCHITECTURE.md) §8.

결정일: 2026-11-09 (분리). 장기 검토 문구 추가: 2026-11-10.

## 2. 계정 · 가족 · 온보딩

**기본은 공용 관리자 계정 하나.**

- 익숙한 한 사람이 가족 공용 Auth로 가입·동기화를 관리한다.
- 구성원은 **앱 가입을 요구하지 않는다.** 같은 로그인·기기를 쓰면 된다.
- 화면의 “가족”은 **프로필(이름·역할 메모)** 이며 멤버별 로그인이 아니다.
- 초대 코드·멤버별 Auth는 **선택·향후**이며 S5 기본 UX의 중심이 아니다.
- 부모 외부 사이트 비밀번호를 앱에 저장하지 않는다.

**온보딩 (2026-11-10 기록, 배포본 검증 후):**

- 클라우드 설정 + 미로그인 시 **로그인/가입을 탭보다 먼저** 보여 준다. 「로컬로만 먼저 둘러볼게요」우회 가능.
- 가입 시 **집 이름**은 필수이며 `create_household`로 가구를 만든다. 프로필 display_name과 분리(기본 표시명 `관리자`).
- 검증: `main` 코드·`tests/onboarding.test.js`·Pages 번들 문자열/RPC 호출명 확인. 실계정 대화형 E2E는 별도.

근거: `docs/PRODUCT_DIRECTION.md`, `src/cloud/onboarding.js`, `docs/handoff-history.md`.  
계정 모델 결정일: 2026-11-09. 온보딩: 2026-11-10.

## 3. Supabase 동기화 · 보안

- 로그인 + 집(household) 연결 후 **자동으로** `cloud-primary` (클라우드가 기본 저장소).
- 부트스트랩 판단 범위: 장보기·재고·식단·오늘 저녁·가족 프로필 (+ 기기 조리 패턴·소스 카탈로그 신호). 개수 한두 종류만 보지 않음.
- **조리 패턴·소스는 기기 로컬 카탈로그** (클라우드 테이블 없음). 동기화 대상이 아니며 pull 실패/성공과 무관하게 이 기기 값을 유지.
- 부트스트랩 규칙: 클라우드 비어 있으면 로컬 push · 로컬(동기화 대상) 비어 있으면 pull · **양쪽에 서로 다른 기록이 있으면** 미리보기·승인 후에만 이전(자동 덮어쓰기 금지).
- **pull 경로:** 클라우드 다운로드 성공이 확정된 뒤에만 `cloud-primary`로 전환·저장. 실패 시 기존 로컬 데이터·mode 보존. `pullCloudQuiet` 오류를 성공으로 오인하지 않음.
- 집(household) 전환 시 이전 집 scoped 캐시를 저장하고 새 집은 캐시/빈 셸로 격리 — 재고·장보기 혼합 금지.
- 네트워크 오류 시 mode를 억지로 바꾸거나 로컬을 지우지 않음.
- RLS·가구 권한으로 데이터 격리. anon에 위험한 SECURITY DEFINER 실행을 열지 않도록 마이그레이션에서 제한.
- 클라이언트에는 **publishable/anon만**. `service_role`·API 시크릿은 브라우저/Git/문서에 금지.
- 오프라인 cloud-primary: **읽기 전용** (쓰기 큐는 S5-C, 미구현·미승인).
- 로그아웃/계정 전환 시 미러 혼합 방지.

변경: 2026-11-10 — 수동 「이전 승인」을 기본 경로에서 제거.  
변경: 2026-11-10 — 부트스트랩 footprint·충돌 승인·집 전환 격리 보강 (스키마 삭제/초기화 없음).

**민감·확장 데이터 정책 (현재 확정):**

- **현재:** 건강 수치, 금융/계좌 정보, 외부(부모 사이트 등) 비밀번호는 Family Flow의 **동기화·영속 저장 대상이 아니다.** ActionProposal도 `sensitivity: personal_health`를 거부한다 ([ACTION_PROPOSAL.md](ACTION_PROPOSAL.md)).
- **향후:** 건강·가계 등 도메인 추가나 관련 데이터 연동은 **별도 사용자 승인** 후에만 설계·구현한다. 승인 전까지 스키마·UI·동기화·AI 컨텍스트에 넣지 않는다. (장기 구상 목록과 혼동하지 말 것.)

상세: [SUPABASE_SETUP.md](SUPABASE_SETUP.md), [S5B_SYNC.md](S5B_SYNC.md). 결정일: 2026-11-09. 확장 가능 문구 명시: 2026-11-10.

## 4. AI 계층 (현재 운영 경로)

**현재 코드 경로** (환경별 실제 도달 단계는 [ARCHITECTURE.md](ARCHITECTURE.md) §6 · [AI_PROVIDER.md](AI_PROVIDER.md)):

1. 한국어 고신뢰 **로컬 패턴**
2. **Ollama** (Vite `/api/ollama` → loopback만; **Pages에는 프록시 없음**; 공인 무인증 공개 금지)
3. Ollama 불가 시 Supabase Edge **`ai-complete` → Groq 무료** (JWT + 가구 권한 + `claim_ai_quota`; 미로그인·가구 미연결 시 불가)
4. 실패 시 **규칙/안내**. 유료 플랜·결제 업셀 **금지**

- API 키는 Edge Secrets만. 앱 쿼터: 가구당 20 RPM · 200 RPD (문서·마이그레이션 기준).
- 모델 출력은 신뢰하지 않는다. JSON → op 화이트리스트 → proposal 검증.
- `normalizeAiOp` / `parseQuickAdd`로 shopping.add 보정.

**NVIDIA NIM:** 과거 검토·인터페이스 주석에만 등장. **현재 런타임에 NIM 어댑터·호출 없음.** 현재 사용 중으로 쓰지 않는다.

상세: [AI_PROVIDER.md](AI_PROVIDER.md), [AI_FAILOVER.md](AI_FAILOVER.md), [ARCHITECTURE.md](ARCHITECTURE.md) §6.  
결정일: 2026-11-09. NIM 구분 명시: 2026-11-10.

## 5. ActionProposal 승인 정책

- 규칙·AI는 도메인 state를 **직접 변경하지 않는다.**
- 유일한 저장 경로: `createProposal` / 검증 → `previewProposal` → **사용자 승인** → `applyProposal` (원자·idempotent).
- `sensitivity: personal_health` 거부. 지원 op만 화이트리스트.
- 미리보기는 clone만 사용. 거절/보류는 dismiss 메타로 스누즈 가능.

상세: [ACTION_PROPOSAL.md](ACTION_PROPOSAL.md). 결정일: 2026-11-09 (S2).

## 6. UX / UI — 승인 상태

| 항목 | 상태 |
| --- | --- |
| 제품 UX 목표 (능동형 가정 비서, 홈 = 오늘 우리 집 할 일) | **승인됨** (PRODUCT_DIRECTION A형) |
| 로그인 우선·가입 시 집 이름 | **승인·배포됨** (§2) |
| **홈 UX 상호작용 (저녁 추천 중심)** | **승인됨** (2026-11-10, 경로 B) |
| 전면 비주얼 시안 A/B/C/D · Quiet/Clear/HomeSteady 팔레트 | **미확정** — 구현하며 다듬기 |
| 내비 4탭(홈·식생활·가족·더보기) | **채택** (2026-11-10) — 장보기/재고/식단은 식생활 세그먼트 |
| 색상·타이포·디자인 토큰·컴포넌트 형태 | **미확정** (기존 CSS 유지·점진 조정) |

### 6.1 홈 UX 상호작용 (2026-11-10 확정)

지향: Apple식 정돈·조작감 + Toss식 정보 위계·행동 중심.  
최근 와이어프레임 D를 **디자인 기준으로 확정하지 않음.** 비주얼은 구현 과정에서 다듬음.

1. 홈에서 AI/규칙이 **먼저** 오늘 저녁을 제안한다 (질문 대기 UI가 주인공 아님).
2. **이대로** → 미리보기 → 사용자 승인 후에만 `meals.confirm_dinner`(및 필요 시 장보기) 반영.
3. **바꾸기** → 다른 확인된 후보로 전환 후 다시 이대로.
4. 재고·최근 식단·조리 부담 등 **확인된 정보만** 근거로 쓴다. 모르는 재고는 추측하지 않는다.
5. 재료가 **확인된 부족/없음**일 때만 장보기 추가를 제안에 포함한다.
6. 승인 대기 없음·추천 데이터 부족 시 **빈 상태**를 보여 준다.

원칙 vs 미확정 분리: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 7. 배포 · Git

- 기능·문서 변경은 **브랜치 + PR**. `main` 직접 push·승인 없는 병합 금지.
- **GitHub Pages는 배포되어 운영 중** (`https://h3clo.github.io/familyflow/`). 추가 push/설정 변경은 사용자 승인 후.
- 테스트 통과 개수는 시점마다 `npm test`로 확인한다. 문서에 고정 규칙처럼 박지 않는다.

결정일: 2026-11-09. Pages 운영·테스트 서술 정정: 2026-11-10.
