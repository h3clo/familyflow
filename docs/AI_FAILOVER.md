# AI 자동 전환 (Ollama → Groq → 규칙)

확인일: 2026-11-09 (공식 문서 기준)

## Groq 무료 모델·한도 (재확인)

출처: [Rate Limits](https://console.groq.com/docs/rate-limits), [Models](https://console.groq.com/docs/models)

| 모델 ID | 비고 | Free 감각 (조직) |
| --- | --- | --- |
| `openai/gpt-oss-20b` | **기본 사용** (Production) | 30 RPM · 1K RPD · 8K TPM · 200K TPD |
| `openai/gpt-oss-120b` | 허용 목록 | 동일 |
| `qwen/qwen3.8-27b` | Preview — 기본값으로 쓰지 않음 | 동일 표기 |

- 결제수단 등록·Developer 유료 업그레이드 **금지**
- 429 시 앱은 **유료 전환 제안 없음** → 규칙 모드

앱 자체 한도(Edge `claim_ai_quota`): 가구당 **20 RPM · 200 RPD** (Groq 한도보다 보수적)

## 흐름

1. 한국어 고신뢰 로컬 패턴
2. Ollama (`/api/ollama` → loopback만)
3. Supabase Edge `ai-complete` → Groq (JWT + 가구 권한 + 쿼터)
4. 규칙/안내

응답은 항상 ActionProposal 검증·미리보기·승인.

## Secrets

`GROQ_API_KEY`는 Family Flow 프로젝트 Edge Secrets에만 둡니다.  
브라우저·GitHub·채팅·로그에 넣지 않습니다.

대시보드: Project Settings → Edge Functions → Secrets  
프로젝트: `gocbvzsljkhnttcydpcv` only
