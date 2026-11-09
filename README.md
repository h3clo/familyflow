# Family Flow

가족과 함께 쓰는 생활 관리 웹앱입니다. **A형: 필요한 일을 먼저 제안하는 홈**이 중심이고, 장보기·재고·식단은 그 도구입니다.

Haze Flow와 **완전히 독립**된 프로젝트입니다. Haze Flow 코드·DB를 수정하지 않습니다.

## 지금 되는 것 (S1–S3)

- 홈: 규칙 기반 제안 카드 (이유 + 미리보기/나중에)
- **S2 ActionProposal 승인 파이프라인:** 미리보기 → 승인 → 원자적 저장 (idempotent)
- 장보기 「재고에서 제안」도 동일 미리보기·승인
- 재고 없음·부족 → 장보기 담기 (목록 중복 방지, 거절 시 잠시 숨김)
- 단백질 재고 → 오늘 저녁 확정 제안
- 복합 변경 예: 주간 단백질 교체 + 부족 시 장보기 (`docs/ACTION_PROPOSAL.md`)
- **S3 로컬 AI:** 더보기 → Ollama 연결 확인·응답 테스트 (`docs/AI_PROVIDER.md`). 실패해도 규칙/장보기 유지. 브라우저→`/api/ollama` 프록시→loopback만 사용
- **S4 대화:** 홈에서 한국어로 말하면 ActionProposal 미리보기·승인. 대화만/확인 질문은 저장 없음
- **S5-A 가족 클라우드(코드):** Auth·가구·초대·RLS·로컬→클라우드 복사 UI (`docs/SUPABASE_SETUP.md`). 프로젝트 생성은 사용자 작업
- 데이터 없을 때 초기 설정 안내 (가짜 재고/구매 이력 생성 안 함)
- 장보기 CRUD·예산·체크, 재고 상태, 식단 초안 (기존 유지)
- 로컬 저장 · AI/인터넷 없이도 동작

## 실행

```sh
npm install
npm test
npm run dev
```

브라우저: http://127.0.0.1:5174/

모바일에서 같은 Wi‑Fi의 맥/PC IP로 접속하려면 `vite --host 0.0.0.0`으로 바꾸거나, 배포(승인 후)를 사용하세요.

## Supabase (사용자 설정 필요 · Haze Flow와 분리)

상세: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

1. **새** Supabase 프로젝트 (Haze Flow 재사용 금지)
2. SQL: `202611090001_…` → `202611090002_…` 순 적용
3. `.env.local`에 URL + **publishable/anon** 키만 (`service_role` 금지)
4. 더보기 → 가족 클라우드에서 가입·가구·초대·복사

GitHub push·공개 배포는 이 단계에서 하지 않습니다.

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
