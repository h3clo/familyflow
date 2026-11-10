# Family Flow · Supabase 설정 (S5-A)

Haze Flow와 **현재 분리된** Family Flow 전용 프로젝트를 사용합니다. (장기 선택 연동은 [ARCHITECTURE.md](ARCHITECTURE.md) §8 · 지금 구현 없음)

동기화: [S5B_SYNC.md](S5B_SYNC.md). 결정: [DECISIONS.md](DECISIONS.md) §2–3. 상태: [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## Auth URL (Pages + 로컬)

Supabase Dashboard → Authentication → URL Configuration에 다음을 맞춘다.

| 항목 | 값 |
| --- | --- |
| Site URL | `https://h3clo.github.io/familyflow/` |
| Redirect URLs | `https://h3clo.github.io/familyflow/**` |
| Redirect URLs (로컬) | `http://127.0.0.1:5174/**` · `http://localhost:5174/**` |

이메일 매직링크·OAuth 콜백이 Pages와 로컬 둘 다에서 동작하려면 위 Redirect를 **모두** 넣는다.  
`GROQ_API_KEY`·`service_role`은 Auth URL과 무관하며 Edge Secrets / 서버에만 둔다.

## GitHub Pages 빌드용 공개 설정

Pages 프로덕션 빌드는 커밋된 `.env.production`의 **publishable/anon 공개 값**만 사용한다.  
(Cursor GitHub App은 Actions Secrets 쓰기 권한이 없어, 클라이언트 공개 키를 `.env.production`에 둔다.)

`service_role`·`GROQ_API_KEY`는 `.env.production`·프론트 번들·Actions 로그에 **넣지 않는다**. Edge Secrets만 사용.

공개 사이트: **https://h3clo.github.io/familyflow/** (배포됨).

## 현재 상태 (에이전트가 완료)

프로젝트 ref: `gocbvzsljkhnttcydpcv` (이름: family flow)

이미 적용됨:

- core + S5-A 스키마/RLS/RPC
- S5-B `family_profiles` + realtime publication
- 가입 시 이메일 자동 확인 트리거 (`ff_autoconfirm_user`) — SMTP 없이 바로 로그인 가능 (**운영 주의:** 아래 「보안·장기 검토」)
- 초대 RPC `expires_at` 모호성 수정
- 로컬 `.env.local` (gitignore)
- Pages 클라이언트 설정 (`.env.production` publishable만)

다기기 동기화 상세: `docs/S5B_SYNC.md`

## 보안·장기 검토 (현재 동작 유지 · 구현 변경 없음)

### 이메일 자동 확인 (`ff_autoconfirm_user`)

- **현황:** 가입 직후 이메일을 검증하지 않고 확인 처리해, 커스텀 SMTP 없이도 바로 로그인할 수 있다.
- **운영상 위험:** 이메일 소유 증명이 없다. 가입이 열려 있으면 **타인 이메일로 계정만 만들고** 가구·클라우드 기능을 쓰는 남용이 가능해질 수 있다. 공용 가족 앱 전제·소규모 사용에는 편의 우선으로 두었으나, 공개 노출·불특정 가입이 늘면 위험이 커진다.
- **추후 검토 (미승인·미구현):** 프로덕션 SMTP + **실제 이메일 검증**으로 전환하고, 자동확인 트리거 폐기·완화 여부를 결정한다. 전환 시 기존 사용자 영향·매직링크 Redirect를 함께 본다.

### 가족 공용 계정 — 권한·감사 추적 한계

- **현황:** 기본은 Auth 계정 하나 + 가족 **프로필**. 구성원별 로그인이 아니다.
- **한계:** 장보기·재고·식단 변경의 **행위자(누가 바꿨는지)** 를 사람 단위로 구분·감사하기 어렵다. 기기·세션이 같아도 프로필과 Auth가 1:1이 아니다.
- **장기 검토 (미구현):** 멤버별 Auth, 역할·권한 세분화, 변경 감사 로그. 시점·범위는 미정. 지금은 공용 계정 모델을 바꾸지 않는다 ([DECISIONS.md](DECISIONS.md) §2).

### 쓰는 방법 (기본)

1. 앱을 열면 (클라우드 설정됨·미로그인) **로그인/가입이 먼저** 보인다.
2. 익숙한 한 사람이 이메일로 **가족 공용 계정** 가입 — **집 이름** 필수 → 가구 생성.
3. 로그인·집 연결 시 **자동으로** 클라우드가 기본 저장소가 됩니다 (양쪽 다 데이터가 있을 때만 미리보기).
4. 엄마·아빠는 별도 가입하지 않음.

로컬 우회: 「로컬로만 먼저 둘러볼게요」. 이후 더보기 → 우리 집 클라우드에서도 로그인 가능.

초대 코드로 다른 Auth를 붙이는 흐름은 **선택 기능**이며 기본 사용법이 아니다.

## `.env.local` (이미 있으면 그대로)

```env
VITE_SUPABASE_URL=https://gocbvzsljkhnttcydpcv.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable 또는 anon 공개 키>
```

`service_role` 키는 넣지 마세요.

## 앱에서 하는 일

- 회원가입 · 로그인 · 로그아웃
- 가구 만들기 (`create_household` → owner) — 가입 흐름에 포함
- 초대 코드 발급 · 참여 (고급)
- 로컬 → 클라우드 복사 (로컬 자동 삭제 없음)
- 클라우드 → 로컬 불러오기 (명시적 버튼)

## RLS 요약

- 공유 테이블은 모두 `household_id`
- 멤버만 읽기, editor/owner만 쓰기
- 가구 생성·초대는 RPC만

## 아직 안 하는 것

- Realtime 동시 편집 전용 UI
- Haze Flow DB 연동 (장기 검토만)
- 프로덕션 SMTP + 이메일 검증 전환 (위 「보안·장기 검토」)
- 멤버별 Auth·변경 감사 추적 (위 「보안·장기 검토」)
- S5-C 오프라인 쓰기 큐
