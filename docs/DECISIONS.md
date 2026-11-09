# Family Flow — 확정 결정

**확정된 결정만** 적는다. 시안·가설·미승인 계획은 `PROJECT_GUIDE` 대기열에 두고 여기 넣지 않는다.  
변경 시 날짜와 한 줄 이유를 남긴다.

## 1. Haze Flow와 Family Flow 역할

| | Family Flow | Haze Flow |
| --- | --- | --- |
| 중심 | **우리 집** 가정 운영 | **나**의 운동·루틴·기록 |
| 저장소 | `/agent/repos/familyflow` | Haze 저장소 (이 프로젝트에서 수정 금지) |
| 클라우드 | Family Flow 전용 Supabase | 별도 프로젝트 (공유 금지) |
| 로컬 포트 | `5174` | Haze 기본과 분리 |

결정일: 2026-11-09. Family Flow는 Haze 코드·DB를 재사용하지 않는다.

## 2. 계정 · 가족 모델

**기본은 공용 관리자 계정 하나.**

- 익숙한 한 사람이 가족 공용 Auth로 가입·동기화를 관리한다.
- 엄마·아빠 등 구성원은 **앱 가입을 요구하지 않는다.** 같은 로그인·기기를 쓰면 된다.
- 화면의 “가족”은 **프로필(이름·역할 메모)** 이며 멤버별 로그인이 아니다.
- 초대 코드·멤버별 Auth는 **선택·향후**이며 S5 기본 UX의 중심이 아니다.
- 부모 외부 사이트 비밀번호를 앱에 저장하지 않는다.

근거: `docs/PRODUCT_DIRECTION.md`, `docs/S5B_SYNC.md`. 결정일: 2026-11-09.

## 3. Supabase 동기화 · 보안

- 장보기·재고·식단 등은 이전 **미리보기·사용자 승인** 후에만 `cloud-primary`.
- RLS·가구 권한으로 데이터 격리. anon에 위험한 SECURITY DEFINER 실행을 열지 않도록 마이그레이션에서 제한.
- 클라이언트에는 **publishable/anon만**. `service_role`·API 시크릿은 브라우저/Git/문서에 금지.
- 오프라인 cloud-primary: **읽기 전용** (쓰기 큐는 S5-C, 미구현·미승인).
- 로그아웃/계정 전환 시 미러 혼합 방지.
- 건강 수치·금융·외부 비밀번호는 동기화·저장 대상이 아니다.

상세: `docs/SUPABASE_SETUP.md`, `docs/S5B_SYNC.md`. 결정일: 2026-11-09.

## 4. AI 계층: Ollama → Groq → 규칙

1. 한국어 고신뢰 **로컬 패턴**
2. **Ollama** (Vite `/api/ollama` → loopback만; 공인 무인증 공개 금지)
3. Ollama 불가 시 Supabase Edge **`ai-complete` → Groq 무료** (JWT + 가구 권한 + `claim_ai_quota`)
4. 실패 시 **규칙/안내**. 유료 플랜·결제 업셀 **금지** (`paidUpgrade` 경로 없음)

- API 키는 Edge Secrets만. 앱 쿼터: 가구당 20 RPM · 200 RPD (문서 기준).
- 모델 출력은 신뢰하지 않는다. JSON → op 화이트리스트 → proposal 검증.
- Groq가 `shopping.add` 수량을 빼먹거나 이름에 수량만 넣는 경우 `normalizeAiOp`/`parseQuickAdd`로 보정 후 검증.

상세: `docs/AI_PROVIDER.md`, `docs/AI_FAILOVER.md`. 결정일: 2026-11-09.

## 5. ActionProposal 승인 정책

- 규칙·AI는 도메인 state를 **직접 변경하지 않는다.**
- 유일한 저장 경로: `createProposal` / 검증 → `previewProposal` → **사용자 승인** → `applyProposal` (원자·idempotent).
- `sensitivity: personal_health` 거부. 지원 op만 화이트리스트.
- 미리보기는 clone만 사용. 거절/보류는 dismiss 메타로 스누즈 가능.

상세: `docs/ACTION_PROPOSAL.md`. 결정일: 2026-11-09 (S2).

## 6. UX / UI 디자인 방향 — 승인 상태

| 항목 | 상태 |
| --- | --- |
| 제품 UX 목표 (능동형 가정 비서, 홈 = 오늘 우리 집 할 일) | **승인됨** (PRODUCT_DIRECTION A형) |
| 전면 UI 재설계 시안 A/B/C (Calm Ops / Focus / Pulse) | **제시됨 · 구현 미승인** |
| 내비 4탭·식생활 세그먼트·AI 시트 등 구체 IA | **제안 단계** — 사용자 선택 전 코드 반영 금지 |
| 기존 베이지·초록 유지 여부 | 시안에서 논의됨, **최종 미확정** |

시안·분석은 채팅/캔버스 산출물이다. **승인 회신이 오기 전에는 DECISIONS에 “디자인 확정”으로 올리지 않는다.**

## 7. 배포 · Git

- 기본: 로컬 커밋. **push / Pages / 공개 배포는 사용자 승인 후.**
- Family Flow GitHub remote가 없으면 원격 push를 가정하지 않는다.

결정일: 2026-11-09 (README·SUPABASE_SETUP과 동일 취지).
