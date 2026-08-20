/* ============================================================
   Pedro API - lets other programs talk to Pedro.

     node api.js            then POST to http://localhost:8788/api/chat

   It serves the web app too, so one command runs everything.

   Anything that can make an HTTP request can use it: Roblox (HttpService),
   iPhone Shortcuts, a script, another app. Pedro answers with the same
   personality and the same lessons you taught him in the browser.
   ============================================================ */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PEDRO_PORT || 8788);
const CONFIG_FILE = path.join(ROOT, "pedro-api.json");
const BRAIN_FILE  = path.join(ROOT, "pedro-brain.json");

/* ---------- config ---------- */
function loadConfig(){
  let cfg = {
    token: "",                                  /* required in every request */
    provider: "local",                          /* "local" or "gemini" */
    ollamaUrl: "http://localhost:11434",
    localModel: "qwen2.5:7b",
    geminiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: "gemini-2.5-flash",
    aiName: "Pedro",
    userName: "",
    about: ""
  };
  if(fs.existsSync(CONFIG_FILE)){
    try { Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))); }
    catch(e){ console.error("pedro-api.json is not valid JSON - using defaults"); }
  }
  if(!cfg.token){
    /* first run: mint a token so the API isn't open to the whole network */
    cfg.token = "pk_" + require("crypto").randomBytes(16).toString("hex");
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    console.log("\nCreated pedro-api.json with a new access token.\n");
  }
  return cfg;
}

/* ---------- what you taught him, exported from the app ---------- */
function loadBrain(){
  if(!fs.existsSync(BRAIN_FILE)) return { facts: [], lessons: [] };
  try {
    const b = JSON.parse(fs.readFileSync(BRAIN_FILE, "utf8"));
    return { facts: b.facts || [], lessons: b.lessons || [] };
  } catch(e){
    console.error("pedro-brain.json is not valid JSON - ignoring it");
    return { facts: [], lessons: [] };
  }
}

/* same relevance rule the app uses, so the API behaves like the app */
const STOP = new Set(" the a an and or but if is are was were be been to of in on for with that this it as at by from i you my your me we ".trim().split(/\s+/));
function relevance(text, lesson){
  const words = String(text).toLowerCase().match(/[a-z0-9']+/g) || [];
  const hay = (lesson.q + " " + (lesson.tag || "")).toLowerCase();
  let score = 0; const seen = new Set();
  for(const w of words){
    if(w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    if(hay.includes(w)) score += w.length > 5 ? 2 : 1;
  }
  return score;
}
function pickLessons(text, all, max = 6){
  if(!all.length) return [];
  const scored = all.map(l => ({ l, s: relevance(text, l) }))
                    .filter(x => x.s > 0)
                    .sort((a, b) => b.s - a.s);
  if(!scored.length) return all.slice(-Math.min(3, max));
  return scored.slice(0, max).map(x => x.l);
}

function systemPrompt(cfg, brain, question){
  const who = cfg.userName || "the user";
  let p = `You are ${cfg.aiName}, ${cfg.userName ? cfg.userName + "'s" : "the user's"} personal assistant. ` +
    `You are being called from another program rather than a chat window, so answer plainly and directly.\n\n` +
    `Today is ${new Date().toDateString()}.\n`;
  if(cfg.userName) p += `Their name is ${cfg.userName}.\n`;
  if(cfg.about)    p += `About them:\n${cfg.about}\n`;

  if(brain.facts.length){
    p += `\nThings ${who} has told you to remember:\n`;
    for(const f of brain.facts) p += `- ${f}\n`;
  }
  const picked = pickLessons(question, brain.lessons);
  if(picked.length){
    p += `\nThey have taught you how to answer things like this. Follow these closely:\n`;
    for(const l of picked) p += `\nQ: ${l.q}\nA: ${l.a}\n`;
  }
  p += `\nKeep answers focused and brief. Lead with the answer. No preamble.`;
  return p;
}

/* ---------- talking to a model ---------- */
function askLocal(cfg, messages){
  const body = JSON.stringify({ model: cfg.localModel, messages, stream: false });
  return post(cfg.ollamaUrl.replace(/\/+$/, "") + "/v1/chat/completions",
              { "content-type": "application/json" }, body)
    .then(r => {
      const d = JSON.parse(r.body);
      if(r.status !== 200) throw new Error(d.error?.message || `Ollama returned ${r.status}`);
      return { reply: (d.choices?.[0]?.message?.content || "").trim(), model: cfg.localModel };
    });
}

function askGemini(cfg, messages){
  if(!cfg.geminiKey) throw new Error("No Gemini key. Put geminiKey in pedro-api.json, or set provider to \"local\".");
  const sys = messages.find(m => m.role === "system");
  const rest = messages.filter(m => m.role !== "system");
  const body = JSON.stringify({
    systemInstruction: sys ? { parts: [{ text: sys.content }] } : undefined,
    contents: rest.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }))
  });
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(cfg.geminiModel) + ":generateContent?key=" + encodeURIComponent(cfg.geminiKey);
  return post(url, { "content-type": "application/json" }, body)
    .then(r => {
      const d = JSON.parse(r.body);
      if(r.status !== 200) throw new Error(d.error?.message || `Gemini returned ${r.status}`);
      const parts = d.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => typeof p.text === "string" && !p.thought)
                        .map(p => p.text).join("").trim();
      return { reply: text, model: cfg.geminiModel };
    });
}

function post(url, headers, body){
  const lib = url.startsWith("https") ? require("https") : require("http");
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, method: "POST",
      headers: Object.assign({ "content-length": Buffer.byteLength(body) }, headers)
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(180000, () => req.destroy(new Error("the model took too long")));
    req.on("error", e => reject(new Error(
      /ECONNREFUSED/.test(e.message) ? "Can't reach the model. Is Ollama running?" : e.message)));
    req.end(body);
  });
}

function ask(cfg, brain, question, history){
  const messages = [{ role: "system", content: systemPrompt(cfg, brain, question) }];
  for(const m of (history || [])){
    if(m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: question });
  return cfg.provider === "gemini" ? askGemini(cfg, messages) : askLocal(cfg, messages);
}

/* ---------- http ---------- */
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".json":"application/json", ".webmanifest":"application/manifest+json",
  ".svg":"image/svg+xml", ".png":"image/png", ".md":"text/markdown; charset=utf-8" };

function readBody(req){
  return new Promise((resolve, reject) => {
    let d = "", size = 0;
    req.on("data", c => {
      size += c.length;
      if(size > 1e6){ reject(new Error("request too large")); req.destroy(); return; }
      d += c;
    });
    req.on("end", () => resolve(d));
  });
}
function send(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,authorization,x-pedro-key"
  });
  res.end(body);
}

const cfg = loadConfig();

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = url.pathname;

  if(req.method === "OPTIONS"){
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-pedro-key"
    });
    return res.end();
  }

  /* ---- the API ---- */
  if(route === "/api/chat" || route === "/v1/chat/completions"){
    if(req.method !== "POST") return send(res, 405, { error: "use POST" });

    const given = req.headers["x-pedro-key"] ||
                  String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if(given !== cfg.token) return send(res, 401, { error: "wrong or missing token" });

    let payload;
    try { payload = JSON.parse(await readBody(req) || "{}"); }
    catch(e){ return send(res, 400, { error: "body must be JSON" }); }

    /* accept both our own shape and the OpenAI one */
    let question, history = [];
    if(Array.isArray(payload.messages)){
      const msgs = payload.messages.filter(m => m.role !== "system");
      question = msgs.length ? msgs[msgs.length - 1].content : "";
      history = msgs.slice(0, -1);
    } else {
      question = payload.message || payload.prompt || "";
      history = payload.history || [];
    }
    if(!question || typeof question !== "string")
      return send(res, 400, { error: "send { \"message\": \"...\" }" });

    const brain = loadBrain();                 /* re-read so edits apply live */
    try {
      const out = await ask(cfg, brain, question, history);
      if(route === "/v1/chat/completions"){
        return send(res, 200, {
          id: "pedro-" + Date.now(), object: "chat.completion", model: out.model,
          choices: [{ index: 0, message: { role: "assistant", content: out.reply },
                      finish_reason: "stop" }]
        });
      }
      return send(res, 200, { reply: out.reply, model: out.model, provider: cfg.provider });
    } catch(e){
      return send(res, 502, { error: String(e.message || e) });
    }
  }

  if(route === "/api/health"){
    const brain = loadBrain();
    return send(res, 200, {
      ok: true, provider: cfg.provider,
      model: cfg.provider === "gemini" ? cfg.geminiModel : cfg.localModel,
      taught: { facts: brain.facts.length, lessons: brain.lessons.length }
    });
  }

  /* ---- the web app ---- */
  let rel = decodeURIComponent(route);
  if(rel === "/") rel = "/index.html";
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
  if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end("no"); }
  fs.readFile(file, (err, data) => {
    if(err){ res.writeHead(404, {"content-type":"text/plain"}); return res.end("Not found: " + rel); }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
}).listen(PORT, () => {
  const brain = loadBrain();
  console.log(`\nPedro API on http://localhost:${PORT}`);
  console.log(`  app        http://localhost:${PORT}/`);
  console.log(`  chat       POST /api/chat        { "message": "..." }`);
  console.log(`  openai     POST /v1/chat/completions`);
  console.log(`  health     GET  /api/health`);
  console.log(`\n  provider   ${cfg.provider} (${cfg.provider === "gemini" ? cfg.geminiModel : cfg.localModel})`);
  console.log(`  taught     ${brain.facts.length} facts, ${brain.lessons.length} lessons`);
  console.log(`  token      ${cfg.token}`);
  console.log(`\nEdit pedro-api.json to change the provider or model. Ctrl+C to stop.\n`);
});
