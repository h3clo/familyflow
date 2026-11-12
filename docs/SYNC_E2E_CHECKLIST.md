# 실계정·다기기 sync 점검 체크리스트 (P1)

운영 **공용 가족 계정**으로는 시험하지 않는다 (`AGENTS.md`).  
격리: QA 전용 계정 + `?sandbox&device=…` (또는 별도 브라우저 프로필).

자동화 기준선: `npm run test:qa` · Actions **Supabase QA** (`docs/SUPABASE_QA.md`).  
동작 요약: `docs/S5B_SYNC.md`.

## A. 자동화 (매 PR / secrets 있을 때)

| # | 확인 | 기대 |
| --- | --- | --- |
| A1 | `auth: sign-in / session / sign-out` | 세션 발급·해제 |
| A2 | CRUD + push → fresh client pull | 장보기·재고 왕복 |
| A3 | RLS (계정 A vs B) | 타 가구 읽기 차단 |
| A4 | anon 접근 | 가구 데이터 거부 |

## B. 수동 · 격리 계정 (브라우저 2개)

준비: QA 계정 하나, URL에 `?sandbox&device=mac` / `?sandbox&device=phone` (같은 기기에서도 버킷 분리).

| # | 단계 | 기대 | 결과 |
| --- | --- | --- | --- |
| B1 | sandbox 배지 표시 | 헤더/히어로에 `sandbox · …` | |
| B2 | 기기 A 로그인 → 집 선택/생성 | `cloud-primary` 부트스트랩 | |
| B3 | A에서 장보기 추가 → 온라인 푸시 | 동기화됨 | |
| B4 | 기기 B 동일 계정 로그인 → pull | A 항목 보임 | |
| B5 | B에서 항목 체크/삭제 → A pull·Realtime | A에 반영, 삭제 재등장 없음 | |
| B6 | 양쪽에 서로 다른 로컬 기록 충돌 | 자동 덮어쓰기 없이 미리보기 | |
| B7 | 오프라인 cloud-primary에서 수정 시도 | 읽기 전용 차단 | |
| B8 | 로그아웃 | 활성 미러 제거·로컬 백업 복구, sandbox 키만 영향 | |
| B9 | sandbox 없이 기본 URL | 기본 `familyflow-v1` 버킷 그대로 | |
| B10 | A에서 가족 취향 메모(`좋아함:`/`싫어함:`) 저장 → B pull | note ≤120자 왕복, 저장 직후 pull에 안 덮임 | |

## C. 의도적으로 미실시

- 가족 **운영 공용 계정** 로그인·삭제·초기화
- 운영 클라우드 행 수동 삭제

## 기록

| 일자 (Asia/Seoul) | 범위 | 결과 | 비고 |
| --- | --- | --- | --- |
| 2026-11-11 | A (CI live-supabase-qa on #38) | PASS | 격리 QA 계정 |
| 2026-11-11 | B 수동 | 미실시 | 체크리스트·sandbox 구현 후 대기 |
