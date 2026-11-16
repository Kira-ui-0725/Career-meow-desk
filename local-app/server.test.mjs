import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { authFailureMessage, parsePlanText, readResponseStream, verifyIdToken } from "./server.mjs";

test("核实 ID token 的签名、受众和 nonce", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256" };
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
  const claims = { iss: "https://auth.openai.com", aud: "oaiapp_example", sub: "person-1", nonce: "fresh-nonce", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signed = `${header}.${payload}`;
  const token = `${signed}.${sign("sha256", Buffer.from(signed), privateKey).toString("base64url")}`;
  const keys = async () => ({ keys: [jwk] });
  assert.equal((await verifyIdToken(token, "oaiapp_example", "fresh-nonce", keys)).sub, "person-1");
  await assert.rejects(verifyIdToken(token, "oaiapp_other", "fresh-nonce", keys));
  await assert.rejects(verifyIdToken(token, "oaiapp_example", "wrong-nonce", keys));
  await assert.rejects(verifyIdToken(`${signed}.bad-signature`, "oaiapp_example", "fresh-nonce", keys));
});

test("只接受合理的可编辑日程草案", () => {
  assert.deepEqual(parsePlanText('{"items":[{"title":"慢跑","duration":60,"category":"运动","estimated":false}],"notes":[]}').items[0], { title: "慢跑", duration: 60, category: "运动", estimated: false });
  assert.throws(() => parsePlanText('{"items":[{"title":"慢跑","duration":500}]}'));
  assert.throws(() => parsePlanText('{"items":[]}'));
});

test("只有完整的 Responses 流才能生成结果", async () => {
  const stream = (data) => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(data)); controller.close(); } }), { status: 200 });
  const ok = 'data: {"type":"response.output_text.delta","delta":"{\\"items\\":[]} "}\n\ndata: {"type":"response.completed"}\n\n';
  assert.equal(await readResponseStream(stream(ok)), '{"items":[]} ');
  await assert.rejects(readResponseStream(stream('data: {"type":"response.output_text.delta","delta":"half"}\n\n')));
  await assert.rejects(readResponseStream(stream('data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n')));
});

test("登录错误区分地区限制和身份校验阶段", () => {
  assert.match(authFailureMessage({ code: "unsupported_country_region_territory", status: 403 }, "换取登录凭证"), /当前网络出口/);
  assert.match(authFailureMessage({ status: 403 }, "校验身份签名"), /403/);
  assert.match(authFailureMessage(new Error("签名无效"), "校验身份签名"), /身份签名校验/);
});
