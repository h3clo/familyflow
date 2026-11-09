# Family Flow

가족과 함께 쓰는 생활 관리 웹앱입니다. **A형: 필요한 일을 먼저 제안하는 홈**이 중심이고, 장보기·재고·식단은 그 도구입니다.

Haze Flow와 **완전히 독립**된 프로젝트입니다. Haze Flow 코드·DB를 수정하지 않습니다.

## Agent / 운영 문서 (상태의 기준)

| 문서 | 역할 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AI 작업 규칙·Haze 분리·검증·computerUse 원칙 |
| [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) | **현재 시작점**·완료/미검증·대기열 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 확정 결정만 |

주제 상세(복제하지 말고 링크): [제품 방향](docs/PRODUCT_DIRECTION.md) · [ActionProposal](docs/ACTION_PROPOSAL.md) · [AI Provider](docs/AI_PROVIDER.md) · [AI Failover](docs/AI_FAILOVER.md) · [Supabase](docs/SUPABASE_SETUP.md) · [S5-B Sync](docs/S5B_SYNC.md)

## 지금 되는 것 (요약)

구현·검증 구분은 **PROJECT_GUIDE**가 기준이다. 요약만:

- 홈 규칙 제안, ActionProposal 미리보기→승인→저장
- 장보기·재고·식단, 한국어 대화(S4), Ollama 및 Groq 페일오버(무료 Edge)
- 공용 가족 계정·가구 RLS·다기기 sync(S5-B), 오프라인 읽기 전용
- 로컬 저장 · AI 없이도 핵심 기능 동작

## 실행

```sh
npm install
npm test
npm run dev
```

브라우저: http://127.0.0.1:5174/

## Supabase

Haze와 **다른** 프로젝트만 사용. 설정 절차: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).  
`.env.local`에는 URL + publishable/anon만 (`service_role` 금지).

GitHub push·공개 배포는 승인 전까지 하지 않습니다.

## 배포 준비 (승인 후)

```sh
npm run build
npm run preview
```

`.github/workflows/pages.yml` 존재. **push·Pages는 사용자 승인 후**.

## 테스트

```sh
npm test
npm run build
```
