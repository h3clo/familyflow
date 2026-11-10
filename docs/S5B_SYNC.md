# Family Flow S5-B · 다기기 동기화

계정·보안 결정 요약: [DECISIONS.md](DECISIONS.md) §2–3. 진행 상태: [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## 목표

관리자 **공용 계정 하나**로 MacBook · iPhone · iPad에서 같은 장보기·재고·식단을 안전하게 사용한다.
엄마·아빠는 앱에 가입하지 않는다. 가족은 **프로필**로만 표현한다.

## 동작 요약

1. 로그인 → 집(household) 선택/생성
2. **자동 부트스트랩**으로 `cloud.mode = cloud-primary` (클라우드가 기본 저장소)
   - 판단 신호: 장보기·재고·식단·오늘 저녁·가족 프로필 (+ 기기 패턴·소스 카탈로그)
   - 클라우드 비어 있음 → 이 기기 기록 push
   - 이 기기 동기화 대상 비어 있음 → 클라우드 pull
   - **양쪽에 서로 다른 기록** → 미리보기 후 승인(자동 덮어쓰기 없음)
3. 집 전환: 이전 집 scoped 캐시 저장 → 새 집 캐시 또는 빈 셸 (데이터 혼합 금지)
4. 이후 변경은 로컬 캐시에 즉시 반영 + 온라인일 때 클라우드 푸시
5. Realtime + 주기적 pull로 다른 기기 변경 반영
6. 오프라인: 캐시 **조회만**, 수정은 차단 (안전한 오프라인 쓰기 큐는 이번 단계 범위 밖)
7. 로그아웃/계정 전환: 활성 미러 제거, 기기 로컬 백업 복구 → 데이터 혼합 방지
8. 삭제 항목은 클라우드에서도 제거(reconcile) → 삭제 후 재등장 방지
9. 관련 순수 로직: `src/cloud/bootstrap.js`

## 동기화 대상 / 기기 로컬

**클라우드에 올리는 것:** 장보기·재고·식단(meal plan)·오늘 저녁·가족 프로필.

**이 기기 카탈로그만 (클라우드 테이블 없음):** 조리 패턴(`cookingPatterns`)·소스(`sauces`).  
pull/push 해도 기기 카탈로그를 지우거나 다른 집 데이터와 섞지 않는다. 부트스트랩 footprint에는 *신호*로만 포함한다.

**부트스트랩 pull:** 다운로드가 성공한 뒤에만 `cloud.mode = cloud-primary`로 올린다. 실패 시 로컬 데이터·mode 보존.

## 저장하지 않는 것 (현재 정책)

- 건강 수치, 금융/계좌, 부모 사이트 비밀번호  
  → **현재** 동기화·영속 저장 대상 아님. 향후 도메인 확장은 **별도 승인** 후 ([DECISIONS.md](DECISIONS.md) §3).

## 관련 파일

- `src/cloud/migratePlan.js` — 이전 미리보기
- `src/cloud/sync.js` — push/pull + 삭제 정합
- `src/cloud/syncRuntime.js` — 상태·오프라인·Realtime
- `src/cloud/sessionScope.js` — 계정/가구 스코프 캐시
- `supabase/migrations/202611090004_s5b_family_profiles_sync.sql`
