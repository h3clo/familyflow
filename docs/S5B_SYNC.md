# Family Flow S5-B · 다기기 동기화

계정·보안 결정 요약: [DECISIONS.md](DECISIONS.md) §2–3. 진행 상태: [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## 목표

관리자 **공용 계정 하나**로 MacBook · iPhone · iPad에서 같은 장보기·재고·식단을 안전하게 사용한다.
엄마·아빠는 앱에 가입하지 않는다. 가족은 **프로필**로만 표현한다.

## 동작 요약

1. 로그인 → 집(household) 선택/생성
2. **이전 미리보기**로 로컬 vs 클라우드 충돌·이름 중복 확인
3. 사용자 승인 후에만 `cloud.mode = cloud-primary` (클라우드가 기본 저장소)
4. 이후 변경은 로컬 캐시에 즉시 반영 + 온라인일 때 클라우드 푸시
5. Realtime + 주기적 pull로 다른 기기 변경 반영
6. 오프라인: 캐시 **조회만**, 수정은 차단 (안전한 오프라인 쓰기 큐는 이번 단계 범위 밖)
7. 로그아웃/계정 전환: 활성 미러 제거, 기기 로컬 백업 복구 → 데이터 혼합 방지
8. 삭제 항목은 클라우드에서도 제거(reconcile) → 삭제 후 재등장 방지

## 저장하지 않는 것

- 건강 수치, 금융/계좌, 부모 사이트 비밀번호

## 관련 파일

- `src/cloud/migratePlan.js` — 이전 미리보기
- `src/cloud/sync.js` — push/pull + 삭제 정합
- `src/cloud/syncRuntime.js` — 상태·오프라인·Realtime
- `src/cloud/sessionScope.js` — 계정/가구 스코프 캐시
- `supabase/migrations/202611090004_s5b_family_profiles_sync.sql`
