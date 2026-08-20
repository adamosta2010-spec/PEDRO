global.window = {};
global.location = { hostname: "localhost", protocol: "http:" };
/* Provider routing, local model, and the failover chain. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
function grab(name){
  const i = src.indexOf("function " + name + "(");
  if(i < 0) throw new Error("no such function: " + name);
  let d = 0, j = src.indexOf("{", i);
  for(let k = j; k < src.length; k++){
    if(src[k] === "{") d++;
    else if(src[k] === "}"){ d--; if(!d) return src.slice(i, k + 1); }
  }
}
/* the prompt names the apps Pedro can open; the list itself is not what these test */
const appList = () => "maps, music, spotify, messages, phone, web";
const names = ["activeGeminiModel","fastGeminiModel","bestModel","modelTier","modelVersion","studies","studyFor","studyOf","forgetStudy","shortContext","trimImages","memories","recallFor","onHostMachine","guessLocalUrl","isDevice","inApp","isGemini","isGroq","isLocal","isOpenAIStyle","allKeys","apiKeyNow","activeModel",
               "systemPrompt","taughtBlock","pickLessons","relevance","lessons","facts","claudeContent","geminiParts","claudeRequest","geminiRequest",
               "groqRequest","localRequest","buildRequest","readDelta","apiError","apiErrorBody","providerLabel",
               "usableProviders","nextProvider","providerLabel","isBusy"];
let store = { settings:{ provider:"gemini", aiName:"Pedro",
  apiKey:"", geminiKey:"", groqKey:"", model:"claude-opus-5",
  geminiModel:"gemini-2.5-flash", imageModel:"gemini-2.5-flash-image",
  groqModel:"llama-3.3-70b-versatile", localUrl:"http://localhost:11434",
  localModel:"qwen2.5:7b", localSeen:false, effort:"low", name:"", about:"", facts:[], lessons:[], memories:[], studies:[] } };
let voiceMode = false;
const isLocked = () => false;
eval(names.map(grab).join("\n"));

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};
const S = store.settings;
const msgs = [{role:"user",content:"hi"},{role:"assistant",content:"yo"},{role:"user",content:"weather?"}];

/* ---- local model ---- */
S.provider = "local";
t("local needs no key", apiKeyNow(), "local");
const L = buildRequest(msgs);
t("local hits ollama openai endpoint", L.url, "http://localhost:11434/v1/chat/completions");
t("local sends no auth header", L.headers.authorization, undefined);
t("local puts the system prompt first", L.body.messages[0].role, "system");
t("local maps roles", L.body.messages.slice(1).map(m => m.role), ["user","assistant","user"]);
t("local streams", L.body.stream, true);
t("local uses the chosen model", L.body.model, "qwen2.5:7b");
S.localUrl = "http://localhost:11434/";
t("trailing slash in url is handled", buildRequest(msgs).url, "http://localhost:11434/v1/chat/completions");
S.localUrl = "http://localhost:11434";

/* ---- openai-shaped streaming, shared by local and groq ---- */
t("local delta parsed", readDelta({choices:[{delta:{content:"Hi"}}]}).text, "Hi");
t("local finish reason ignored when normal", readDelta({choices:[{delta:{},finish_reason:"stop"}]}).stop, null);
t("local length cutoff flagged", readDelta({choices:[{delta:{},finish_reason:"length"}]}).stop, "length");
t("empty local chunk safe", readDelta({}).text, "");
S.provider = "groq"; S.groqKey = "gsk_TEST";
t("groq uses bearer auth", buildRequest(msgs).headers.authorization, "Bearer gsk_TEST");
t("groq and local share the parser", isOpenAIStyle(), true);
S.provider = "gemini";
t("gemini is not openai-shaped", isOpenAIStyle(), false);

/* ---- what counts as worth retrying ---- */
t("429 is busy", isBusy(429), true);
t("500 is busy", isBusy(500), true);
t("503 is busy", isBusy(503), true);
t("529 is busy", isBusy(529), true);
t("404 is not busy", isBusy(404), false);
t("401 is not busy", isBusy(401), false);
t("400 is not busy", isBusy(400), false);

/* ---- failover ordering ---- */
S.provider = "gemini"; S.geminiKey = "AIza"; S.groqKey = "gsk"; S.apiKey = ""; S.localSeen = false;
t("current provider comes first", usableProviders()[0], "gemini");
t("unconfigured providers excluded", usableProviders(), ["gemini","groq"]);
t("next after gemini is groq", nextProvider(["gemini"]), "groq");
t("nothing left once both tried", nextProvider(["gemini","groq"]), null);

S.localSeen = true;
t("local joins the chain once it has answered", usableProviders().indexOf("local") >= 0, true);
t("gemini still first while selected", usableProviders()[0], "gemini");
S.provider = "local";
t("local first when selected", usableProviders()[0], "local");
t("falls back off local to a cloud one", ["gemini","groq"].indexOf(nextProvider(["local"])) >= 0, true);

S.geminiKey = ""; S.groqKey = ""; S.apiKey = ""; S.localSeen = false;
t("no providers set up yields empty chain", usableProviders(), []);
t("nextProvider copes with an empty chain", nextProvider([]), null);

/* ---- labels used in the switch message ---- */
t("labels read naturally", [providerLabel("local"), providerLabel("gemini"), providerLabel("groq")],
  ["the local model","Gemini","Groq"]);

/* ---- local error guidance ---- */
S.provider = "local";
t("missing local model tells you the pull command",
  apiError(404, "{}").includes("ollama pull qwen2.5:7b"), true);


/* ---- "On this iPhone" must be impossible outside the wrapped app ---- */
{
  const src2 = fs.readFileSync(process.argv[2], "utf8");
  const isDeviceSrc = (src2.match(/function isDevice\(\)\{[^\n]*\n?/) || [""])[0];
  t("isDevice requires the native bridge", /&&\s*!!Native/.test(isDeviceSrc), true);

  const askSrc = (() => {
    const i = src2.indexOf("function askDevice(");
    return src2.slice(i, i + 400);
  })();
  t("askDevice refuses when the bridge is missing", /if\(!Native\)/.test(askSrc), true);
  t("...and says why in plain words", /only works in the installed app/i.test(askSrc), true);

  const syncSrc = (() => {
    const i = src2.indexOf("function syncProviderUI(");
    /* the whole function, however long it grows - a fixed slice used to cut
       the end off and fail for no reason to do with the app */
    let d = 0;
    for(let k = src2.indexOf("{", i); k < src2.length; k++){
      if(src2[k] === "{") d++;
      else if(src2[k] === "}"){ d--; if(!d) return src2.slice(i, k + 1); }
    }
    return src2.slice(i);
  })();
  t("the option is removed, not just hidden", /removeChild\(od\)/.test(syncSrc), true);

  t("a stranded 'device' setting is repaired at startup",
    /function fixStrandedProvider/.test(src2) && /fixStrandedProvider\(\);/.test(src2), true);
}


/* ---- the local model is tied to the machine it runs on ---- */
{
  const at = (host, proto) => {
    global.location = { hostname: host, protocol: proto || "http:" };
    return onHostMachine();
  };
  t("localhost counts as the host machine", at("localhost"), true);
  t("127.0.0.1 counts too", at("127.0.0.1"), true);
  t("a phone on the LAN does not", at("192.168.0.176"), false);
  t("the hosted site does not", at("super-starlight-52f7d8.netlify.app", "https:"), false);
  t("opened as a file counts as the host", at("", "file:"), true);

  global.location = { hostname: "192.168.0.176", protocol: "http:" };
  t("off-host, the model address follows the server",
    guessLocalUrl(), "http://192.168.0.176:11434");

  global.location = { hostname: "localhost", protocol: "http:" };
  t("on the host, the configured address is used",
    guessLocalUrl(), "http://localhost:11434");
}


/* ---- the phone's own model has to be used, not just offered ---- */
{
  const src2 = require("fs").readFileSync(process.argv[2], "utf8");
  const once = (function(){
    const i = src2.indexOf("function askOnce(");
    let d = 0;
    for(let k = src2.indexOf("{", i); k < src2.length; k++){
      if(src2[k] === "{") d++;
      else if(src2[k] === "}"){ d--; if(!d) return src2.slice(i, k + 1); }
    }
  })();
  t("voice uses the phone's model instead of the network",
    once.indexOf("if(isDevice()){") > -1 && once.indexOf("askDevice(c.messages)") > -1, true);
  t("it checks before building a request",
    once.indexOf("isDevice()") < once.indexOf("buildRequest"), true);
  t("an unknown provider is not quietly treated as Claude",
    src2.indexOf('provider === "device"') > -1 &&
    src2.indexOf("doesn't use the network") > -1, true);
}

console.log(fail ? String.fromCharCode(10) + fail + " FAILURES" : String.fromCharCode(10) + "All " + pass + " provider tests passed");
process.exit(fail ? 1 : 0);
