import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

test('sem chave: /health informa IA desligada e rotas de IA respondem 503 identificado', async () => {
  const { server } = await import('./index');
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const h = await (await fetch(`${base}/health`)).json();
    assert.equal(h.ai, false);
    const r = await fetch(`${base}/v1/analyze`, { method: 'POST', body: '{}' });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, 'no_key');
    assert.equal((await fetch(`${base}/nada`, { method: 'POST' })).status, 404);
  } finally {
    server.close();
  }
});
