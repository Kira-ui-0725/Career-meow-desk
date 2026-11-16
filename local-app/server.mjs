import http from "node:http";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { randomBytes, randomUUID, createHash, createPublicKey, verify } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.CHATGPT_LOCAL_PORT || 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DATA_DIR = process.env.CHATGPT_DATA_DIR || join(homedir(), ".config", "job-search-planner-chatgpt");
const PROFILE_FILE = join(DATA_DIR, "profile.json");
const HOST_FILE = join(DATA_DIR, "host.json");
const AUTH_URL = "https://auth.openai.com/api/accounts/authorize";
const TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
const JWKS_URL = "https://auth.openai.com/.well-known/jwks.json";
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const CATEGORIES = new Set(["投递", "学习", "笔面准备", "运动", "休息", "其他"]);
const STATIC = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/index.html", ["index.html", "text/html; charset=utf-8"]], ["/style.css", ["style.css", "text/css; charset=utf-8"]], ["/app.js", ["app.js", "text/javascript; charset=utf-8"]], ["/plan-text.js", ["plan-text.js", "text/javascript; charset=utf-8"]], ["/favicon.svg", ["favicon.svg", "image/svg+xml"]]]);
let pending = null;
let refreshPromise = null;

const random = () => randomBytes(32).toString("base64url");
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const fail = (res, status, message) => json(res, status, { error: message });
const callbackPage = (res, status, message) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ChatGPT 连接</title><body style="font:16px system-ui;padding:40px"><h1>ChatGPT 连接未完成</h1><p>${message}</p><a href="/">返回求职小助手</a></body></html>`); };

async function readJson(path) { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function saveJson(path, value) {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  await rename(temp, path);
}
async function hostId() {
  const saved = await readJson(HOST_FILE);
  if (saved?.id?.startsWith("urn:uuid:")) return saved.id;
  const id = `urn:uuid:${randomUUID()}`;
  await saveJson(HOST_FILE, { id });
  return id;
}
async function readBody(req, max = 20000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > max) throw new Error("输入过长");
  }
  return JSON.parse(body);
}
async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`OpenAI 服务返回 ${response.status}`);
    error.status = response.status;
    error.code = body.error?.code || body.code || "";
    throw error;
  }
  return body;
}
export function authFailureMessage(error, stage) {
  if (error.code === "unsupported_country_region_territory") return `在${stage}时，OpenAI 拒绝了当前网络出口（不支持的国家或地区）。请查看 OpenAI 官方支持地区；同一网络下重复登录通常无法解决。`;
  if (error.status === 403) return `在${stage}时，OpenAI 返回 403，拒绝了本机服务请求。请检查当前网络出口是否属于 OpenAI 官方支持地区。`;
  if (error.status) return `在${stage}时，OpenAI 返回 ${error.status}。请稍后重试；若持续失败，可记录这个状态码。`;
  if (error.message === "fetch failed" || error.name === "TimeoutError") return `在${stage}时，本机服务无法连接 OpenAI。请检查网络连接后重试。`;
  if (stage === "校验身份签名") return "OpenAI 已返回登录凭证，但本机未能完成身份签名校验。请检查网络是否允许访问 OpenAI 的公开密钥端点。";
  return `在${stage}时遇到错误，请返回重试。`;
}
function jwtPart(value) { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
export async function verifyIdToken(token, clientId, nonce, getKeys = () => fetchJson(JWKS_URL)) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("身份凭证格式错误");
  const header = jwtPart(parts[0]);
  const claims = jwtPart(parts[1]);
  if (!["RS256", "ES256"].includes(header.alg) || !header.kid) throw new Error("不支持的身份签名");
  const keys = await getKeys();
  const jwk = keys.keys?.find((key) => key.kid === header.kid && (!key.alg || key.alg === header.alg));
  if (!jwk) throw new Error("无法验证身份签名");
  const valid = verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
  const now = Math.floor(Date.now() / 1000);
  if (!valid || claims.iss !== "https://auth.openai.com" || !(claims.aud === clientId || Array.isArray(claims.aud) && claims.aud.includes(clientId)) || claims.nonce !== nonce || !claims.sub || !Number.isFinite(claims.exp) || claims.exp <= now - 5 || !Number.isFinite(claims.iat) || claims.iat > now + 5) throw new Error("身份凭证校验失败");
  return claims;
}
async function beginAuth(res) {
  const profile = await readJson(PROFILE_FILE);
  const verifier = random();
  const state = random();
  const nonce = random();
  const clientId = profile?.clientId || "dynamic_agent_client";
  const redirectUri = `${ORIGIN}/auth/callback`;
  pending = { state, nonce, verifier, clientId, redirectUri, subject: profile?.subject || null, expiresAt: Date.now() + 10 * 60 * 1000 };
  const url = new URL(AUTH_URL);
  const params = { client_id: clientId, ext_agent_host_id: await hostId(), response_type: "code", redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE, state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") };
  if (profile?.clientId) { if (profile.idToken) params.id_token_hint = profile.idToken; if (profile.email) params.login_hint = profile.email; }
  else params.agent_name_hint = "求职小助手";
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  res.writeHead(302, { location: url.href, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  res.end();
}
async function finishAuth(url, res) {
  const attempt = pending;
  pending = null;
  if (!attempt || attempt.expiresAt < Date.now() || url.searchParams.get("state") !== attempt.state) return callbackPage(res, 400, "登录请求已过期或校验失败，请重新尝试。");
  if (url.searchParams.has("error")) return callbackPage(res, 400, "授权被取消，请返回后重试。");
  const code = url.searchParams.get("code");
  const issuedClient = url.searchParams.get("client_id");
  const clientId = attempt.clientId === "dynamic_agent_client" ? issuedClient : attempt.clientId;
  if (!code || !clientId || attempt.clientId !== "dynamic_agent_client" && issuedClient && issuedClient !== clientId) return callbackPage(res, 400, "登录回调不完整，请重新尝试。");
  let stage = "换取登录凭证";
  try {
    const tokens = await fetchJson(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: RESOURCE }) });
    if (!tokens.id_token || !tokens.access_token) throw new Error("登录未返回完整凭证");
    stage = "校验身份签名";
    const identity = await verifyIdToken(tokens.id_token, clientId, attempt.nonce);
    if (attempt.subject && identity.sub !== attempt.subject) throw new Error("登录账号与原连接不一致");
    const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
    stage = "保存本机连接";
    await saveJson(PROFILE_FILE, { clientId, subject: identity.sub, email: identity.email || "", name: identity.name || "", idToken: tokens.id_token, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || "", scopes, expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000 });
    res.writeHead(302, { location: "/#today", "cache-control": "no-store" }); res.end();
  } catch (error) { callbackPage(res, 502, authFailureMessage(error, stage)); }
}
async function accessProfile() {
  const profile = await readJson(PROFILE_FILE);
  if (!profile?.accessToken || !profile.scopes?.includes("chatgpt.tokens.use.direct")) throw new Error("请先登录并允许使用 ChatGPT 订阅");
  if (profile.expiresAt > Date.now() + 60000) return profile;
  if (!profile.refreshToken) throw new Error("登录已过期，请重新授权");
  if (!refreshPromise) refreshPromise = (async () => {
    const refreshed = await fetchJson(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: profile.clientId, refresh_token: profile.refreshToken, resource: RESOURCE }) });
    const updated = { ...profile, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || profile.refreshToken, idToken: refreshed.id_token || profile.idToken, scopes: String(refreshed.scope || profile.scopes.join(" ")).split(/\s+/).filter(Boolean), expiresAt: Date.now() + (Number(refreshed.expires_in) || 3600) * 1000 };
    if (!updated.accessToken) throw new Error("登录续期失败，请重新授权");
    await saveJson(PROFILE_FILE, updated);
    return updated;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function models() {
  const profile = await accessProfile();
  const body = await fetchJson(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${profile.accessToken}` } });
  return (Array.isArray(body.models) ? body.models : []).filter((model) => model.visibility === "list" && model.slug).map((model) => ({ id: model.slug, name: model.display_name || model.slug }));
}
export function parsePlanText(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const body = JSON.parse(cleaned);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 12) throw new Error("模型未返回 1—12 项可编辑任务");
  const items = body.items.map((item) => ({ title: String(item.title || "").trim().slice(0, 100), duration: Number(item.duration), category: item.category === "项目复盘" ? "学习" : CATEGORIES.has(item.category) ? item.category : "其他", estimated: Boolean(item.estimated) }));
  if (items.some((item) => !item.title || !Number.isInteger(item.duration) || item.duration < 10 || item.duration > 240)) throw new Error("模型返回的任务时长或名称无效");
  return { items, notes: Array.isArray(body.notes) ? body.notes.slice(0, 5).map((note) => String(note).slice(0, 150)) : [] };
}
export async function readResponseStream(response) {
  if (!response.ok) throw new Error(`OpenAI 服务返回 ${response.status}`);
  if (!response.body) throw new Error("模型没有返回数据流");
  let buffer = ""; let text = ""; let completed = false;
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
    if (buffer.length > 120000 || text.length > 60000) throw new Error("模型返回内容过长");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, boundary).replace(/\r/g, "");
      buffer = buffer.slice(boundary + 2);
      const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      const item = JSON.parse(data);
      if (item.type === "response.output_text.delta") text += item.delta || "";
      else if (item.type === "response.failed" || item.type === "response.incomplete" || item.type === "error") throw new Error(item.response?.error?.code || item.error?.code || "模型生成未完成");
      else if (item.type === "response.completed") completed = true;
    }
  }
  if (!completed) throw new Error("模型输出中断，未完成生成");
  return text;
}
async function generatePlan(input) {
  const text = String(input.text || "").trim();
  const date = String(input.date || "");
  if (!text || text.length > 2000 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("请填写 2000 字以内的任务文字和有效日期");
  const available = await models();
  if (!available.some((model) => model.id === input.model)) throw new Error("请选择当前账号可用的模型");
  const profile = await accessProfile();
  const fixed = Array.isArray(input.fixedEvents) ? input.fixedEvents.slice(0, 30).map((event) => ({ kind: String(event.kind || "").slice(0, 30), title: String(event.title || "").slice(0, 100), time: String(event.time || "").slice(0, 5), endTime: String(event.endTime || "").slice(0, 5) })) : [];
  const response = await fetch(`${RESOURCE}/responses`, { method: "POST", headers: { authorization: `Bearer ${profile.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ model: input.model, instructions: "你是求职日程助手。只输出严格 JSON 对象，格式为 {\"items\":[{\"title\":\"任务名\",\"duration\":分钟整数,\"category\":\"投递|学习|笔面准备|运动|休息|其他\",\"estimated\":布尔值}],\"notes\":[\"说明\"]}。按原话拆分为 1—12 项，不添加原话没有的任务；时长没有给出时估计并标记 estimated。每项 10—240 分钟。不要输出 Markdown。", input: [{ role: "user", content: `日期：${date}\n已记录的面试笔试：${JSON.stringify(fixed)}\n待安排事项：${text}` }], store: false, stream: true }), signal: AbortSignal.timeout(60000) });
  return parsePlanText(await readResponseStream(response));
}
async function serveStatic(path, res) {
  const entry = STATIC.get(path);
  if (!entry) return fail(res, 404, "未找到页面");
  const data = await readFile(join(ROOT, entry[0]));
  res.writeHead(200, { "content-type": entry[1], "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(data);
}
export function createAppServer() {
  return http.createServer(async (req, res) => {
    if (req.headers.host !== `127.0.0.1:${PORT}`) return fail(res, 403, "仅允许本机访问");
    res.setHeader("referrer-policy", "no-referrer");
    const url = new URL(req.url || "/", ORIGIN);
    try {
      if (req.method === "GET" && url.pathname === "/auth/start") return await beginAuth(res);
      if (req.method === "GET" && url.pathname === "/auth/callback") return await finishAuth(url, res);
      if (req.method === "GET" && url.pathname === "/api/chatgpt/status") {
        const profile = await readJson(PROFILE_FILE);
        return json(res, 200, { localApp: true, connected: Boolean(profile?.accessToken), sharing: Boolean(profile?.scopes?.includes("chatgpt.tokens.use.direct")), email: profile?.email || "", name: profile?.name || "" });
      }
      if (req.method === "GET" && url.pathname === "/api/chatgpt/models") return json(res, 200, { models: await models() });
      if (req.method === "POST" && url.pathname === "/api/chatgpt/plan-draft") {
        if (req.headers.origin !== ORIGIN || !String(req.headers["content-type"] || "").startsWith("application/json")) return fail(res, 403, "请求来源无效");
        return json(res, 200, await generatePlan(await readBody(req)));
      }
      if (req.method === "GET") return await serveStatic(url.pathname, res);
      return fail(res, 405, "不支持的请求方式");
    } catch (error) {
      const message = ["subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable"].includes(error.message) ? "ChatGPT 使用额度暂不可用，请点击“管理用量”查看" : ["输入过长", "请先登录并允许使用 ChatGPT 订阅", "登录已过期，请重新授权", "登录续期失败，请重新授权", "模型输出中断，未完成生成", "模型返回内容过长", "模型未返回 1—12 项可编辑任务", "模型返回的任务时长或名称无效", "请选择当前账号可用的模型", "请填写 2000 字以内的任务文字和有效日期"].includes(error.message) ? error.message : "请求失败，请检查网络或重新登录";
      return fail(res, 400, message);
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createAppServer().listen(PORT, "127.0.0.1", () => { process.stdout.write(`求职小助手本地版：${ORIGIN}\n`); });
}
