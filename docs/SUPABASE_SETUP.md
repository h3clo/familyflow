# Family Flow · Supabase 설정 (S5-A)

Haze Flow 프로젝트와 **완전히 분리**된 Family Flow 전용 프로젝트를 사용합니다.
GitHub push·공개 배포는 하지 않습니다.

## 현재 상태 (에이전트가 완료)

프로젝트 ref: `gocbvzsljkhnttcydpcv` (이름: family flow)

이미 적용됨:
- core + S5-A 스키마/RLS/RPC
- 가입 시 이메일 자동 확인 트리거 (`ff_autoconfirm_user`) — SMTP 없이 바로 로그인 가능
- 초대 RPC `expires_at` 모호성 수정
- 로컬 `.env.local` (이 저장소, gitignore)

로컬 앱: `http://127.0.0.1:5174/` → **더보기 → 가족 클라우드**에서 가입·가구 만들기.

## `.env.local` (이미 있으면 그대로)

```env
VITE_SUPABASE_URL=https://gocbvzsljkhnttcydpcv.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable 또는 anon 공개 키>
```

`service_role` 키는 넣지 마세요.

## 앱에서 하는 일

- 회원가입 · 로그인 · 로그아웃
- 가구 만들기 (`create_household` → owner)
- 초대 코드 발급 · 참여
- 로컬 → 클라우드 복사 (로컬 자동 삭제 없음)
- 클라우드 → 로컬 불러오기 (명시적 버튼)

## RLS 요약

- 공유 테이블은 모두 `household_id`
- 멤버만 읽기, editor/owner만 쓰기
- 가구 생성·초대는 RPC만

## 아직 안 하는 것

- GitHub push / Pages 배포
- Realtime 동시 편집 UI
- Haze Flow DB 연동
- 프로덕션용 커스텀 SMTP (그때 자동확인 트리거 재검토)
