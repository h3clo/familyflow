# Family Flow — 프로젝트 가이드

새 Agent는 이 파일의 **현재 시작점**과 `docs/DECISIONS.md`만으로 이어서 작업한다.  
규칙: `AGENTS.md`. 구조 복원: `docs/ARCHITECTURE.md`. 주제 상세는 링크로만 연다.

## 현재 시작점 (2026-11-11 Asia/Seoul)

**방금 완료:** 실사용 시뮬레이션 QA → UX 패스 (`cursor/ui-usability-pass-c704`).  
핵심: 「잠깐 둘러보기」새로고침 유지 · 추천 근거 접기 · 장보기 직접입력 기본 개방 · 재고 상태 칩 터치 확대.

**지금 작업:** 해당 UX PR 리뷰·병합·Pages 배포 확인.

**다음 행동 (한 가지):** 실계정 동기화 E2E(격리 계정) 또는 sandbox URL 격리 구현 중 승인된 항목.

작업 기준 브랜치: 평소 `main`.  
배포: https://h3clo.github.io/familyflow/

## 구현 완료 (코드에 존재)

| 영역 | 상태 | 상세 |
| --- | --- | --- |
| S1–S5-B · AI failover · auth-first | 배포 | 기존 문서 |
| 클라우드 자동 연결 | 배포 | PR #10 |
| Dinner ranking v2 · 확인 후 재고 등록 | 배포 | PR #11 |
| UI/비주얼(토큰 미확정) | 배포 | dinner 에셋 |

## 검증됨 vs 미검증

### 검증됨 (Pages · 격리 브라우저 프로필 · 2026-11-11)
- 인증 게이트 · 「잠깐 둘러보기」 → 로컬 배지
- 저녁 추천(재고 미확인 칩) · 다른 후보로 바꾸기
- 재고 등록 폼(상태/위치 비움) · 취소 시 inventory 불변 · 부족함/냉동실 승인 저장
- 장보기 직접 입력 추가 · 체크 · 새로고침 후 로컬 유지
- PR #12: `docs/PROJECT_GUIDE.md`만 변경 · CI SUCCESS · 병합 `7d126f5`

### 미검증
- **실계정 로그인** 및 **클라우드 push/pull·다기기 sync** (운영 데이터 보호로 미실시)
- 신규 실계정 가입 E2E
- `?sandbox&device=` URL 격리(AGENTS 언급 · **코드 미구현** — 이번엔 fresh userDataDir로 대체)
- 최종 비주얼 토큰 동결
- computerUse GUI 영상 스모크

## 현재 승인된 결정

포인터 — [DECISIONS.md](DECISIONS.md): ActionProposal, auth-first, 홈 저녁 §6.1 · ranking v2.  
비주얼 팔레트·타이포 **미확정**.

## 작업 대기열

### P0
_(비어 있음)_

### P1 (다음 개발 후보 — 승인 후)
1. 실계정·다기기 동기화 점검 체크리스트/수정
2. 테스트용 `?sandbox&device=`(또는 동등) 저장 키 격리 구현
3. 가족 취향 전용 필드 **또는** 한 끼 예산 배지(장보기 총액과 분리) — 설계만 먼저

### P2
- S5-C, 멤버별 Auth, Haze 연동 설계
- 비주얼 토큰 동결

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
