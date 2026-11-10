# Family Flow · Supabase 실서버 QA

단위 테스트(`npm test`)는 목/로컬만 검증합니다.  
실서버 검증은 `npm run test:qa` + GitHub Actions **Supabase QA** 워크플로입니다.

## 현재 프로덕션 연결 (참고)

| 항목 | 값 |
| --- | --- |
| Project | `family flow` (`gocbvzsljkhnttcydpcv`) |
| Client | `.env.production` publishable 키 (공개) |
| Auth | Email + `ff_autoconfirm_user` |
| Sync | S5-B push/pull + Realtime (`docs/S5B_SYNC.md`) |
| Offline | 조회만 (쓰기 큐 없음) |

**권장:** QA는 **별도 Supabase 프로젝트**에 스키마를 복제해 쓰세요.  
같은 프로젝트를 쓸 경우 **전용 QA 계정 2개**만 사용하고, 개인/가족 실사용 계정은 넣지 마세요.

## GitHub Actions Secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | 필수 | 설명 |
| --- | --- | --- |
| `SUPABASE_QA_URL` | ✅ | QA 프로젝트 URL |
| `SUPABASE_QA_PUBLISHABLE_KEY` | ✅ | publishable/anon (**service_role 금지**) |
| `SUPABASE_QA_USER_A_EMAIL` | ✅ | QA 계정 A |
| `SUPABASE_QA_USER_A_PASSWORD` | ✅ | |
| `SUPABASE_QA_USER_B_EMAIL` | RLS용 | QA 계정 B |
| `SUPABASE_QA_USER_B_PASSWORD` | RLS용 | |

Cursor GitHub App은 secrets **쓰기 권한이 없습니다**. 사용자가 직접 등록해야 합니다.

## 로컬 실행

```bash
export SUPABASE_QA_URL=...
export SUPABASE_QA_PUBLISHABLE_KEY=...
export SUPABASE_QA_USER_A_EMAIL=...
export SUPABASE_QA_USER_A_PASSWORD=...
# optional
export SUPABASE_QA_USER_B_EMAIL=...
export SUPABASE_QA_USER_B_PASSWORD=...

npm run test:qa
```

시크릿이 없으면 테스트는 **skip** 되고 `실제 서버 미검증`을 출력합니다 (exit 0).

## Actions 사용법

1. Secrets 등록 + QA 계정 2개 생성 (Email provider)
2. Actions → **Supabase QA** → **Run workflow** (`workflow_dispatch`)
3. PR이 `src/cloud/**`, `supabase/**`, `qa/**` 등을 바꾸면 워크플로가 돌며, secrets 없으면 단위 테스트만 하고 live는 skip
4. secrets가 **있는** 상태에서 live 실패 → 잡 실패 (CI red)

정기 cron은 secrets 준비 후 `qa/github-actions/supabase-qa.yml.template` 주석을 해제하세요.

## 데이터 안전

- 행 이름은 `[QA <runId>] …` 로만 태깅
- 종료 시 태깅된 shopping/inventory/profile만 삭제
- 가구 셸(`ff-qa-shared-a/b`)은 클라이언트가 DELETE 불가 → 빈 가구가 남을 수 있음 (실사용 데이터 아님)
- `service_role`로 일괄 삭제는 기본 경로에 없음

## 재사용

공통 키트: [`qa/`](../qa/README.md)  
프로젝트별 시나리오만 `tests/integration/`에 두면 됩니다.
