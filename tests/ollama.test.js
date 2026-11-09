import test from 'node:test';
import assert from 'node:assert/strict';
import { createOllamaProvider, installHint, modelSatisfies, extractFinalText } from '../src/ai/ollama.js';
import { smokeTest, DEFAULT_MODEL } from '../src/ai/provider.js';

test('extractFinalText strips think blocks', () => {
  assert.equal(extractFinalText({ response: 'foo</think>\n\npong' }), 'pong');
  assert.equal(extractFinalText({ response: '', thinking: 'still thinking' }), 'still thinking');
});

test('installHint mentions pull command', () => {
  assert.match(installHint('qwen3:4b'), /ollama pull qwen3:4b/);
  assert.match(installHint(), /인터넷에 직접 열지/);
});

test('modelSatisfies matches tags', () => {
  assert.equal(modelSatisfies('qwen3:4b', 'qwen3:4b'), true);
  assert.equal(modelSatisfies('qwen3:4b-q4_0', 'qwen3:4b'), true);
  assert.equal(modelSatisfies('qwen3:8b', 'qwen3:4b'), false);
});

test('probe offline when fetch fails', async () => {
  const provider = createOllamaProvider({
    baseUrl: 'http://127.0.0.1:9',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  const result = await provider.probe();
  assert.equal(result.status, 'offline');
  assert.match(result.message, /연결할 수 없어요/);
});

test('probe missing_model when tags empty', async () => {
  const provider = createOllamaProvider({
    preferredModel: 'qwen3:4b',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ models: [] }),
    }),
  });
  const result = await provider.probe();
  assert.equal(result.status, 'missing_model');
  assert.match(result.detail.installHint, /ollama pull qwen3:4b/);
});

test('probe ready when preferred model listed', async () => {
  const provider = createOllamaProvider({
    preferredModel: 'qwen3:4b',
    fetchImpl: async (url) => {
      if (String(url).includes('/api/tags')) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'qwen3:4b' }, { name: 'llama3.2:1b' }] }),
        };
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const result = await provider.probe();
  assert.equal(result.status, 'ready');
});

test('smokeTest complete path with mock', async () => {
  const provider = createOllamaProvider({
    preferredModel: DEFAULT_MODEL,
    fetchImpl: async (url, init) => {
      if (String(url).includes('/api/tags')) {
        return { ok: true, json: async () => ({ models: [{ name: DEFAULT_MODEL }] }) };
      }
      if (String(url).includes('/api/generate')) {
        assert.equal(init.method, 'POST');
        return { ok: true, json: async () => ({ response: 'pong' }) };
      }
      throw new Error(String(url));
    },
  });
  const result = await smokeTest(provider);
  assert.equal(result.ok, true);
  assert.equal(result.reply.text, 'pong');
});

test('smokeTest fails closed when offline', async () => {
  const provider = createOllamaProvider({
    fetchImpl: async () => {
      throw new Error('down');
    },
  });
  const result = await smokeTest(provider);
  assert.equal(result.ok, false);
  assert.equal(result.probe.status, 'offline');
});
