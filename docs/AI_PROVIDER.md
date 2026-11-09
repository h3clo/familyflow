# AI Provider · Ollama (S3–S4)

페일오버·쿼터: [AI_FAILOVER.md](AI_FAILOVER.md). 결정 요약: [DECISIONS.md](DECISIONS.md) §4. 구조: [ARCHITECTURE.md](ARCHITECTURE.md) §6.

## 현재 운영 vs 과거 검토

| 경로 | 상태 |
| --- | --- |
| 로컬 한국어 패턴 → Ollama → Groq Edge → 규칙 | **현재 코드·운영** |
| NVIDIA NIM | 주석/과거 문서만. **어댑터·호출 없음** — 현재 사용으로 쓰지 말 것 |

## 원칙

- 규칙 엔진이 기본이다. AI가 꺼지거나 실패해도 홈·장보기·재고·식단은 그대로 동작한다.
- AI/로컬 의도 분석은 `ActionProposal` 후보만 만들고, 저장은 S2 `previewProposal` → 승인 → `applyProposal`만 한다.
- 모델 응답을 신뢰하지 않는다. JSON 파싱 → op 화이트리스트 → 스키마·미리보기 검증.
- **Ollama HTTP(:11434)를 공인 인터넷에 무인증 공개하지 않는다.**
- 클라우드 AI는 **Ollama 불가 시** Supabase Edge `ai-complete` → Groq 무료만. 유료 자동 전환 없음. 상세: `docs/AI_FAILOVER.md`.

## localhost를 혼동하지 않기

| 환경 | `127.0.0.1:11434` 의미 |
| --- | --- |
| 사용자 Mac에서 `npm run dev` | **그 Mac**의 Ollama |
| Cursor Cloud / 원격 에이전트 VM | **그 VM**의 loopback (사용자 Mac Ollama와 다름) |

원격 에이전트가 Mac Ollama에 붙으려면 사설 LAN 브리지·터널이 필요하고, 기본 설정으로는 연결되지 않는 것이 정상이다.

## Vite 개발 프록시 vs 배포

```
브라우저 → 같은 출처 /api/ollama/* → Vite dev/preview 프록시 → 127.0.0.1:11434
```

- `npm run dev` / `npm run preview`: 프록시 동작 (`vite.config.js`).
- 정적 GitHub Pages 등 **공개 배포에는 프록시가 없다.** AI는 로컬 개발 전제이며, 공개 배포에 Ollama를 붙이지 않는다.
- 기본 모델: `qwen3:4b` (M2 16GB 권장).

### 모델이 없을 때

```sh
ollama pull qwen3:4b
```

앱 **더보기 → 로컬 AI**에서 「연결 확인」「응답 테스트」. 홈 **말해 보세요**에서 대화(S4).

## S4 대화 흐름

1. 사용자 한국어 입력
2. 고신뢰 구어 패턴(로컬) 또는 Ollama JSON
3. `finalizeTurn` → `createProposal` + `previewProposal`
4. UI 미리보기 → 사용자 승인 → `applyProposal`
5. `kind=chat|clarify`면 데이터 변경 없음

## 다른 기기에서 나중에 붙일 때

1. Ollama는 그 기기 또는 가정 LAN의 **사설 브리지** 뒤에만 둔다.
2. 브라우저 기본값은 계속 same-origin 프록시(`/api/ollama`)를 쓴다.
3. 프록시 대상만 환경변수로 바꾼다: `FAMILYFLOW_OLLAMA_URL=http://192.168.x.x:11434` (사설 IP).
4. 공유기 포트포워딩·클라우드에 :11434를 열지 않는다.

## 코드

| 파일 | 역할 |
| --- | --- |
| `src/ai/provider.js` | Provider 인터페이스 · smokeTest |
| `src/ai/ollama.js` | Ollama 어댑터 · 모델 감지 · 설치 안내 |
| `src/ai/conversation.js` | 대화 턴 · JSON 검증 · proposal 연결 |
| `src/ai/localIntent.js` | 한국어 구어 고신뢰 패턴 |
| `vite.config.js` | `/api/ollama` → loopback 프록시 |
