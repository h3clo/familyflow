# Family Flow · Supabase 설정 (S5-A)

Haze Flow 프로젝트와 **완전히 분리**된 새 Supabase 프로젝트를 사용합니다.  
이 단계에서는 GitHub push·공개 배포를 하지 않습니다.

## 사용자가 직접 해야 할 일 (필수)

에이전트/로컬 코드만으로는 클라우드 프로젝트를 만들 수 없습니다. 아래를 **Mac 브라우저**에서 진행하세요.

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project**
   - 조직/이름: Family Flow 전용 (Haze Flow 프로젝트 선택·재사용 금지)
   - DB 비밀번호 저장
2. **SQL Editor**에서 순서대로 실행
   - `supabase/migrations/202611090001_familyflow_core.sql`
   - `supabase/migrations/202611090002_familyflow_s5a_auth_household.sql`
3. **Authentication → Providers → Email** 활성화  
   - 개발 중이면 Confirm email을 끄거나, 메일 확인 후 로그인
4. **Project Settings → API**
   - `Project URL` 복사 → `VITE_SUPABASE_URL`
   - `anon` / **publishable** public key 복사 → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **`service_role` 키는 절대 프론트·`.env.local`에 넣지 마세요**
5. 저장소 `familyflow/.env.local` 작성 (git 제외 권장)

```env
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
```

6. `npm run dev` 재시작 → **더보기 → 가족 클라우드**에서 회원가입/로그인

## 앱에서 하는 일

- 회원가입 · 로그인 · 로그아웃
- 가구 만들기 (`create_household` RPC → owner 멤버십)
- 초대 코드 발급 · 참여 (`accept_household_invite`)
- 로컬 장보기·재고·식단을 클라우드로 **복사** (로컬 자동 삭제 없음)
- 클라우드에서 불러오기 (명시적 버튼; 덮어쓰기 전 안내)

## RLS 요약

- 모든 공유 테이블에 `household_id`
- `is_household_member` / `can_edit_household` / `is_household_owner`
- 다른 가구 ID를 클라이언트에 넣어도 SELECT/UPDATE는 멤버십 없으면 거부
- 가구 생성·초대 수락은 security definer RPC만 허용

## localhost 주의

- Cursor Cloud VM의 Supabase/`localhost` ≠ 사용자 Mac
- `.env.local`은 **Family Flow를 실행하는 그 기기**에 둡니다

## 아직 안 하는 것 (이후)

- GitHub push / Pages 배포
- Realtime 동시 편집 충돌 UI
- Haze Flow DB 연동
