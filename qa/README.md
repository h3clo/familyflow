# Reusable Supabase QA kit

Project-agnostic helpers for **live** Supabase tests (auth + RLS + tagged CRUD cleanup).

## Env vars

| Name | Required | Notes |
| --- | --- | --- |
| `SUPABASE_QA_URL` | yes | Project URL |
| `SUPABASE_QA_PUBLISHABLE_KEY` | yes | publishable/anon only |
| `SUPABASE_QA_USER_A_EMAIL` | yes | Dedicated QA account |
| `SUPABASE_QA_USER_A_PASSWORD` | yes | |
| `SUPABASE_QA_USER_B_EMAIL` | for RLS isolation | Second QA account |
| `SUPABASE_QA_USER_B_PASSWORD` | for RLS isolation | |

Never put `service_role` here. Prefer a **separate** Supabase project for QA.

## Files

- `env.mjs` — gate / missing-secret messaging
- `client.mjs` — ephemeral auth client
- `markers.mjs` — run ids + `[QA …]` labels
- `cleanup.mjs` — delete only tagged rows
- `households.mjs` — ensure shared QA household shells
- `github-actions/supabase-qa.yml.template` — copy into `.github/workflows/`

Family Flow live tests: `tests/integration/supabase-live.test.js`  
Guide: `docs/SUPABASE_QA.md`
