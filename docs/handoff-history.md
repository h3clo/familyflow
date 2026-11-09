# Family Flow — Handoff history

긴 인계·복구 이력만 남긴다. **현재 할 일**은 [PROJECT_GUIDE.md](PROJECT_GUIDE.md).  
비밀·토큰·개인 데이터·실계정 이메일은 적지 않는다.  
시각(Asia/Seoul)은 Git/GitHub UTC 시각을 +9로 환산한 참고값이다.

## 2026-11-09 — tip 보존 · 이력 통합

- 이전 Agent 맥락 단절 후 Git tip `178f90f` / `676a43e` / `5c91334` 계열을 원격에 보존.
- PR **#1** (`history-unify`): `origin/main` Initial과 Family Flow tip을 unrelated histories 허용 병합. merge `b2752e1`.

## 2026-11-09 — GitHub Pages 첫 배포

- PR **#2**: Pages 워크플로·`.env.production`(publishable만)·Auth URL 문서. merge `af9f4ee`.
- PR **#3**: 배포 성공 기록. merge `d422be0`.
- 공개 URL: `https://h3clo.github.io/familyflow/`
- Supabase Auth Site/Redirect를 Pages 주소에 맞추는 작업은 대시보드 수동 설정(에이전트 세션에 대시보드 로그인 없음).

## 2026-11-09~10 — 온보딩 UX (전면 재설계 아님)

실사용 피드백:

1. 미로그인 첫 방문 시 로그인/가입이 더보기에 묻혀 불편
2. 가입 시 입력한 집 이름이 가구에 반영되지 않음

- PR **#4**: auth-first 게이트 + 가입 시 `create_household`. merge `28fad91` (UTC 2026-11-09 15:54 → KST 11-10 00:54).
- Pages 재배포 성공. 프로덕션 JS 번들에서 「우리 집 시작하기」「로컬로만…」「집 이름을 입력…」및 `create_household` 문자열 확인 (2026-11-10).
- 단위: `tests/onboarding.test.js`. 대화형 신규 가입 E2E(실계정 생성)는 이 handoff에서 수행하지 않음.

## 2026-11-10 — 문서 방향 복원

- 조건부 승인: 문서만 정비. 코드·UI·DB·배포 설정 변경 없음.
- 추가: `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, 본 파일. 보완: DECISIONS, PROJECT_GUIDE, README, AGENTS, PRODUCT_DIRECTION, SUPABASE_SETUP, AI/Proposal 문구.
- 브랜치: `cursor/docs-restore-c704` (병합은 사용자 승인 후).

## 확인하지 않은 것

- 과거 Cursor Canvas 「A형 방향 재검토」「시안 A/B/C」원본 — 이 저장소·현재 Agent에 없음 (**확인 불가**).
- Haze Flow 저장소 내용 — 접근하지 않음.
