# Family Flow

가족과 함께 쓰는 생활 관리 웹앱입니다. **A형: 필요한 일을 먼저 제안하는 홈**이 중심이고, 장보기·재고·식단은 그 도구입니다.

Haze Flow와 **완전히 독립**된 프로젝트입니다. Haze Flow 코드·DB를 수정하지 않습니다.

## 지금 되는 것 (S1 + S2)

- 홈: 규칙 기반 제안 카드 (이유 + 미리보기/나중에)
- **S2 ActionProposal 승인 파이프라인:** 미리보기 → 승인 → 원자적 저장 (idempotent)
- 재고 없음·부족 → 장보기 담기 (목록 중복 방지, 거절 시 잠시 숨김)
- 단백질 재고 → 오늘 저녁 확정 제안
- 복합 변경 예: 주간 단백질 교체 + 부족 시 장보기 (`docs/ACTION_PROPOSAL.md`)
- 데이터 없을 때 초기 설정 안내 (가짜 재고/구매 이력 생성 안 함)
- 장보기 CRUD·예산·체크, 재고 상태, 식단 초안 (기존 유지)
- 로컬 저장 · AI/인터넷 없이도 동작
- Supabase 마이그레이션·RLS **초안** (미연결)

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
