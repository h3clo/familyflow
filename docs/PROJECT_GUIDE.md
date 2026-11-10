# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 구조 복원: `docs/ARCHITECTURE.md`. 주제 상세는 링크로만 연다.

## 현재 시작점 (2026-11-10 Asia/Seoul)

**방금 완료:** PR #7 홈 저녁 추천 배포.

**지금 작업:** 식생활 허브(장보기·재고·식단 한 탭) + “다음 할 일” 코치 — 브랜치 `cursor/meals-hub-c704`.  
내비: 홈 · 식생활 · 가족 · 더보기. 비주얼 토큰은 여전히 미확정.

**다음 행동 (한 가지):** 식생활 PR 리뷰·병합 승인 대기.

작업 기준 브랜치: 평소 `main`.

## 구현 완료 (코드에 존재)

| 영역 | 상태 | 상세 |
| --- | --- | --- |
| S1–S5-B · AI failover · auth-first | 구현·배포 | 기존 문서 |
| 운영 문서 · PR CI | 완료 | PR #5 · #6 |
| 홈 저녁 추천 UX | 배포 | PR #7 · `dinnerHome.js` |
| 식생활 허브 IA | **구현 중** | `foodHub.js` |

## 검증됨 vs 미검증

### 검증됨
- 단위 테스트·Pages 스모크(실계정 E2E 제외)·PR CI (해당 시점 기록)

### 미검증
- 홈 저녁 추천의 실기기/Pages 사용자 수용 (본 PR 병합·배포 후)
- 신규 실계정 가입 E2E
- 최종 비주얼 토큰

## 현재 승인된 결정

포인터 — [DECISIONS.md](DECISIONS.md): 가정 운영 도우미, 공용 계정, ActionProposal, AI 경로, auth-first, **홈 저녁 추천 상호작용(§6.1)**.  
비주얼 팔레트·타이포 **미확정**.

## 작업 대기열

### P0
1. ~~홈 저녁 추천 PR #7~~ → **완료**
2. **식생활 허브 PR** (본 브랜치) — 병합 승인 대기

### P1
- 비주얼 점진 조정 (토큰 동결은 별도 승인)
- 이메일 자동확인 → SMTP 검토

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
