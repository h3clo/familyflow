# Family Flow

가족과 함께 쓰는 생활 관리 웹앱입니다. 장기적으로는 건강·일정·재정·가사까지 확장하지만, **지금 MVP는 장보기와 재고·식단 부담 완화**에 집중합니다.

Haze Flow와 **완전히 독립**된 프로젝트입니다. Haze Flow 코드·DB를 수정하지 않습니다.

## 지금 되는 것

- 장보기 품목 추가·수정·삭제
- 필수 / 선택 구분, 구매 체크
- 예산·예상 가격
- 빠른 추가 (`휴지 30롤` 같은 문장 → 규칙 파서, AI 불필요)
- 재고(위치·상태)와 장보기 제안·구매 후 재고 반영 제안
- 식단(오늘 제안·소스 라이브러리·주간 초안) — 1차 규칙 엔진
- 로컬 브라우저 저장 (PWA 매니페스트 + 서비스워커)
- Supabase 마이그레이션·RLS **초안** (`supabase/migrations/`)

## 실행

```sh
npm install
npm test
npm run dev
```

브라우저: http://127.0.0.1:5174/

모바일에서 같은 Wi‑Fi의 맥/PC IP로 접속하려면 `vite --host 0.0.0.0`으로 바꾸거나, 배포(승인 후)를 사용하세요.

## Supabase (승인 필요)

1. **새** Supabase 프로젝트를 만듭니다 (Haze Flow와 별도 · Free 한도 2프로젝트).
2. SQL editor에서 `supabase/migrations/202611090001_familyflow_core.sql`을 적용합니다.
3. `.env.example`을 참고해 `.env.local`에 URL·publishable key를 넣습니다.
4. 이후 동기화 클라이언트를 연결합니다 (아직 로컬 저장만 동작).

실제 프로젝트 생성·시크릿 등록·배포는 **사용자 승인 후** 진행합니다.

## 배포 준비

```sh
npm run build
npm run preview
```

GitHub Pages용 워크플로는 `.github/workflows/pages.yml`에 있습니다. `base`는 Actions에서 `/familyflow/`입니다. **push·Pages 배포는 승인 후**.

## 테스트

```sh
npm test
npm run build
```
