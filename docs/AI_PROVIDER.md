# AI Provider · Ollama (S3)

## 원칙

- 규칙 엔진이 기본이다. AI가 꺼지거나 실패해도 홈·장보기·재고·식단은 그대로 동작한다.
- AI는 `ActionProposal` 후보만 만들고(향후 S4), 저장은 S2 승인 파이프라인만 한다.
- **Ollama HTTP(:11434)를 공인 인터넷에 직접 노출하지 않는다.**

## 이 기기(Mac)에서의 경로

```
브라우저 → 같은 출처 /api/ollama/* → Vite 개발 프록시 → 127.0.0.1:11434 (Ollama)
```

기본 모델: `qwen3:4b` (M2 16GB 권장 범위).

### 모델이 없을 때

```sh
ollama pull qwen3:4b
```

앱 **더보기 → 로컬 AI**에서 「연결 확인」「응답 테스트」로 상태를 본다.

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
| `vite.config.js` | `/api/ollama` → loopback 프록시 |
