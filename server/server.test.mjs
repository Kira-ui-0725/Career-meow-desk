import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "./server.mjs";

test("AI draft endpoint checks access and returns validated tasks", async () => {
  let providerRequest;
  const server = createAppServer({ ALLOWED_ORIGIN: "http://localhost:4173", APP_ACCESS_CODE: "private-code", AI_API_KEY: "test-provider-key", AI_MODEL: "test-model", AI_BASE_URL: "http://localhost:9999/v1" }, async (url, options) => {
    providerRequest = { url: String(url), options };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ title: "学习 AI 产品课程", duration: 120, category: "其他", estimated: false }, { title: "慢跑", duration: 60, category: "运动", estimated: false }], notes: ["面试时间以已有记录为准"] }) } }] }), { status: 200 });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/plan-draft`;
  try {
    const denied = await fetch(url, { method: "POST", headers: { origin: "http://localhost:4173", "x-app-access-code": "wrong" } });
    assert.equal(denied.status, 401);
    const wrongOrigin = await fetch(url, { method: "POST", headers: { origin: "https://unexpected.example", "x-app-access-code": "private-code" } });
    assert.equal(wrongOrigin.status, 403);
    const ok = await fetch(url, { method: "POST", headers: { origin: "http://localhost:4173", "x-app-access-code": "private-code", "content-type": "application/json" }, body: JSON.stringify({ text: "学习两小时，慢跑1小时", date: "2026-11-15", fixedEvents: [] }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:4173");
    assert.deepEqual((await ok.json()).items.map((x) => x.duration), [120, 60]);
    assert.equal(providerRequest.url, "http://localhost:9999/v1/chat/completions");
    assert.equal(providerRequest.options.headers.authorization, "Bearer test-provider-key");
  } finally { server.close(); }
});
