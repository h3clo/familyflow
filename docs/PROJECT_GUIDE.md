# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 구조 복원: `docs/ARCHITECTURE.md`. 주제 상세는 링크로만 연다.

## 현재 시작점 (2026-11-11 Asia/Seoul)

**방금 완료:** PR #11 Dinner ranking v2 — squash merge `c7ad4cb` · Pages 배포 (`https://h3clo.github.io/familyflow/`).  
혼합 점수 · untracked 「재고 미확인 · 가정 제안」 · 재고 등록은 상태·위치 확인 후 미리보기→승인만.

**지금 작업:** 실사용 안정성 관찰(배포본). 새 기능 착수 전 사용자 승인.

**다음 행동 (한 가지):** 실계정 동기화·다기기 회귀를 사용자와 함께 확인하거나, 다음 P1(취향 전용 필드 / 예산 배지 별도 설계) 중 하나를 승인받아 착수.

작업 기준 브랜치: 평소 `main`.

## 구현 완료 (코드에 존재)

| 영역 | 상태 | 상세 |
| --- | --- | --- |
| S1–S5-B · AI failover · auth-first | 구현·배포 | 기존 문서 |
| 운영 문서 · PR CI | 완료 | PR #5 · #6 |
| 홈 저녁 추천 UX | 배포 | PR #7 · `dinnerHome.js` |
| 식생활 허브 IA | 배포 | PR #8 · `foodHub.js` |
| 클라우드 자동 연결 | 배포 | PR #10 |
| Dinner ranking v2 | 배포 | PR #11 · `dinnerRank.js` · 확인 후 재고 등록 |
| UI 레이아웃·비주얼 | 배포(토큰 미확정) | `style.css` · dinner 에셋 |

## 검증됨 vs 미검증

### 검증됨
- 단위 테스트 · PR CI · Pages 배포 워크플로 (해당 시점)
- PR #11: 재고 폼→취소 불변 · 부족함/냉동실 승인 저장 (390px 자동화 스모크)
- 배포 번들에 `재고 확인 후 등록` / `재고 미확인 · 가정 제안` 문자열 확인

### 미검증
- 실계정 로그인·다기기 sync E2E (배포본)
- 신규 실계정 가입 E2E
- 최종 비주얼 토큰 동결
- computerUse GUI 영상 스모크(에이전트 점유로 미실시 · 자동화 스모크로 대체)

## 현재 승인된 결정

포인터 — [DECISIONS.md](DECISIONS.md): 가정 운영 도우미, 공용 계정, ActionProposal, AI 경로, auth-first, **홈 저녁 추천 상호작용(§6.1)** · ranking v2.  
비주얼 팔레트·타이포 **미확정**.

## 작업 대기열

### P0
_(비어 있음 — 배포 관찰)_

### P1
- 실계정·다기기 안정성 점검
- 가족 취향 전용 필드(스키마) 별도 제안
- 예산 배지(장보기 총액과 분리) 별도 설계
- 이메일 자동확인 → SMTP 검토
- 비주얼 점진 조정 (토큰 동결은 별도 승인)

### P2
- S5-C, 멤버별 Auth, Haze 연동 설계

## 주제 문서 링크

- [아키텍처](ARCHITECTURE.md) · [디자인 원칙/미확정](DESIGN_SYSTEM.md) · [인계 이력](handoff-history.md)
- [제품 방향](PRODUCT_DIRECTION.md) · [결정 로그](DECISIONS.md)
- [ActionProposal](ACTION_PROPOSAL.md) · [AI Provider](AI_PROVIDER.md) · [AI Failover](AI_FAILOVER.md)
- [Supabase 설정](SUPABASE_SETUP.md) · [S5-B Sync](S5B_SYNC.md)

## 작업 종료 시 갱신 규칙

1. **현재 시작점**을 “방금 한 일 / 다음 행동 한 줄”로 바꾼다.
2. 미검증은 검증됨으로 올리지 않는다.
3. 확정 결정만 `DECISIONS.md`에 추가한다.
4. 긴 과정은 `handoff-history.md`.
5. 비밀·개인 데이터 금지.
6. 테스트 개수를 고정 규칙처럼 쓰지 않는다.
