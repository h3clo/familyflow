# Family Flow · Supabase 설정 (S5-A)

Haze Flow 프로젝트와 **완전히 분리**된 Family Flow 전용 프로젝트를 사용합니다.

동기화 동작: [S5B_SYNC.md](S5B_SYNC.md). 결정: [DECISIONS.md](DECISIONS.md) §2–3. 상태: [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## Auth URL (Pages + 로컬)

Supabase Dashboard → Authentication → URL Configuration에 다음을 맞춘다.

| 항목 | 값 |
| --- | --- |
| Site URL | `https://h3clo.github.io/familyflow/` |
| Redirect URLs | `https://h3clo.github.io/familyflow/**` |
| Redirect URLs (로컬) | `http://127.0.0.1:5174/**` · `http://localhost:5174/**` |

이메일 매직링크·OAuth 콜백이 Pages와 로컬 둘 다에서 동작하려면 위 Redirect를 **모두** 넣는다.  
`GROQ_API_KEY`·`service_role`은 Auth URL과 무관하며 Edge Secrets / 서버에만 둔다.

## GitHub Pages 빌드용 공개 시크릿

저장소 Settings → Secrets and variables → Actions:

| Secret 이름 | 내용 |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://gocbvzsljkhnttcydpcv.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable/anon **공개** 키만 |

`service_role`·`GROQ_API_KEY`는 GitHub Actions 프론트 빌드 시크릿에 **넣지 않는다**.

## 현재 상태 (에이전트가 완료)

프로젝트 ref: `gocbvzsljkhnttcydpcv` (이름: family flow)

이미 적용됨:
- core + S5-A 스키마/RLS/RPC
- S5-B `family_profiles` + realtime publication
- 가입 시 이메일 자동 확인 트리거 (`ff_autoconfirm_user`) — SMTP 없이 바로 로그인 가능
- 초대 RPC `expires_at` 모호성 수정
- 로컬 `.env.local` (이 저장소, gitignore)

다기기 동기화 상세: `docs/S5B_SYNC.md`

로컬 앱: `http://127.0.0.1:5174/` → **더보기 → 가족 클라우드**에서 **우리 집 계정 하나** 만들기.

### 쓰는 방법 (기본)

1. 익숙한 한 사람이 이메일로 **가족 공용 계정** 가입
2. 「우리 집」 가구 만들기
3. 같은 계정으로 로컬 데이터를 클라우드에 복사 / 불러오기
4. 엄마·아빠는 별도 가입하지 않음 (같은 기기·같은 로그인만 쓰면 됨)

초대 코드로 다른 사람 Auth를 붙이는 흐름은 **선택 기능**이며 기본 사용법이 아니다.

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
