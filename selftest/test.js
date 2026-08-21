/* the prompt now lists what he can do on the phone; the harness does not
   need the real list, only something to call */
global.toolsBlock = function(){ return "TOOLS"; };
global.window = {};
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");

/* pull one top-level function out by name, brace-matched */
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
const names = ["activeGeminiModel","fastGeminiModel","bestModel","modelTier","modelVersion","studies","studyFor","studyOf","forgetStudy","shortContext","providerLabel","apiErrorBody","noKeyYet","trimImages","memories","recallFor","isDevice","inApp","isGemini","isGroq","isLocal","isOpenAIStyle","allKeys","apiKeyNow","activeModel","systemPrompt","taughtBlock","pickLessons","relevance","lessons","facts",
               "claudeContent","geminiParts","claudeRequest","geminiRequest","buildRequest","readDelta","stopNote",
               "apiError","aiName","wakeRe","parseKeyPayload"];
let store = { settings:{ provider:"gemini", aiName:"Pedro", apiKey:"", geminiKey:"AIzaTEST",
  model:"claude-opus-5", geminiModel:"gemini-2.5-flash", effort:"low", groqKey:"", groqModel:"llama-3.3-70b-versatile", localUrl:"http://localhost:11434", localModel:"qwen2.5:7b",
  name:"Adam", about:"Builds Roblox games.", facts:[], lessons:[], memories:[], studies:[] } };
let voiceMode = false;
let fastMode = false;   /* the quick path, used for building animations */
const isLocked = () => false;
/* the prompt is built from a plain declaration as well as from functions */
const { decl: declOf } = require("./lib").reader(src);
eval(declOf("MASTER_PROMPT"));
/* he now arrives with lessons of his own */
eval(declOf("HOUSE_LESSONS"));
var allLessons = function(){ return lessons().concat(HOUSE_LESSONS); };
/* the prompt now carries the tone of whichever mood he is in */
eval(declOf("MOODS"));
var moodNow = function(){ return MOODS.normal; };
eval(declOf("SUM_KEEP"));
/* the summary is looked up on the chat being answered in */
var activeChat = function(){ return null; };
eval(declOf("SUM_AFTER"));
eval("var summaryOf = " + grab("summaryOf").replace("function summaryOf", "function") + ";");
eval(declOf("MASTER_WRITTEN"));
/* and the manner - composed and British, or nothing at all */
eval(declOf("MANNERS"));
eval(declOf("MANNER_REPLACES"));
eval("var promptWithout = " + grab("promptWithout").replace("function promptWithout", "function") + ";");
eval("var mannerBlock = " + grab("mannerBlock").replace("function mannerBlock", "function") + ";");
eval(names.map(grab).join("\n"));

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

/* ---- wake word ---- */
t("wakes on bare name", wakeRe().test("pedro"), true);
t("wakes mid-sentence", wakeRe().test("hey pedro whats up"), true);
t("wakes on common mishear", wakeRe().test("hey petro"), true);
t("ignores similar word", wakeRe().test("pedrogram"), false);
t("ignores unrelated speech", wakeRe().test("what is the weather"), false);
store.settings.aiName = "Jarvis";
t("custom wake word", wakeRe().test("ok jarvis") && !wakeRe().test("pedro"), true);
store.settings.aiName = "Pedro";

/* ---- gemini request ---- */
const msgs = [{role:"user",content:"hi"},{role:"assistant",content:"hello"},{role:"user",content:"weather?"}];
const g = buildRequest(msgs);
t("gemini sse url", g.url.includes("models/gemini-2.5-flash:streamGenerateContent?alt=sse"), true);
t("gemini key in query", g.url.includes("key=AIzaTEST"), true);
t("gemini maps assistant to model", g.body.contents.map(c => c.role), ["user","model","user"]);
t("gemini system is separate", typeof g.body.systemInstruction.parts[0].text, "string");
t("gemini sends no anthropic headers", Object.keys(g.headers), ["content-type"]);

/* ---- claude request ---- */
store.settings.provider = "claude"; store.settings.apiKey = "sk-ant-TEST";
const c = buildRequest(msgs);
t("claude url", c.url, "https://api.anthropic.com/v1/messages");
t("claude browser-access header", c.headers["anthropic-dangerous-direct-browser-access"], "true");
t("claude key header", c.headers["x-api-key"], "sk-ant-TEST");
t("claude adaptive thinking", c.body.thinking.type, "adaptive");
store.settings.model = "claude-haiku-4-5";
t("haiku omits thinking (would 400)", buildRequest(msgs).body.thinking, undefined);
store.settings.model = "claude-opus-5";

/* ---- stream parsing, both shapes ---- */
store.settings.provider = "claude";
t("claude text delta", readDelta({type:"content_block_delta",delta:{type:"text_delta",text:"Hi"}}).text, "Hi");
t("claude thinking delta", readDelta({type:"content_block_delta",delta:{type:"thinking_delta",thinking:"hm"}}).think, "hm");
t("claude stop reason", readDelta({type:"message_delta",delta:{stop_reason:"max_tokens"}}).stop, "max_tokens");
store.settings.provider = "gemini";
t("gemini text delta", readDelta({candidates:[{content:{parts:[{text:"Sunny"}],role:"model"}}]}).text, "Sunny");
t("gemini separates thoughts", readDelta({candidates:[{content:{parts:[{text:"reasoning",thought:true},{text:"Answer"}]}}]}),
  {text:"Answer",think:"reasoning",stop:null,error:null});
t("gemini normal finish is not a note", readDelta({candidates:[{finishReason:"STOP",content:{parts:[]}}]}).stop, null);
t("gemini safety finish", stopNote(readDelta({candidates:[{finishReason:"SAFETY",content:{parts:[]}}]}).stop),
  "_I can't help with that one._");
t("gemini empty chunk safe", readDelta({}).text, "");
t("gemini inline error", readDelta({error:{message:"quota"}}).error, "quota");

/* ---- error messages ---- */
t("gemini 429 explains free tier", apiError(429, "{}").includes("free limit"), true);
t("gemini bad key", apiError(400, '{"message":"API key not valid"}').includes("Gemini key"), true);
store.settings.provider = "claude";
t("claude 401", apiError(401, "{}").includes("rejected"), true);

/* ---- prompt ---- */
const long = systemPrompt();
voiceMode = true; const spoken = systemPrompt(); voiceMode = false;
/* the spoken prompt is a different, much shorter one now - that is the point */
t("speaking gets its own short prompt",
  spoken.includes("speaking out loud") && !long.includes("speaking out loud"), true);
/* A third of the written one was an arbitrary line, and the spoken prompt has
   since earned a few hundred characters telling him what to do when the words
   are half-heard. What matters is that it stays small, because it is sent with
   every single question - so check that, and that it is still much the shorter. */
t("and it is shorter than the written one", spoken.length < long.length * 0.7, true);
/* Adam asked for his master prompt to be used, and it is bigger than what was
   here before - deliberately. It is still much the smaller of the two, and the
   tool list is only added when something is actually being asked for. */
t("and still much smaller than the written one", spoken.length < 3400, true);
t("it still carries what he was taught", spoken.includes("Pedro"), true);
t("persona is Pedro", long.startsWith("You are Pedro,"), true);
t("prompt carries user context", long.includes("Adam") && long.includes("Roblox"), true);

/* ---- lock payload ---- */
t("key payload roundtrip", parseKeyPayload(JSON.stringify({claude:"a",gemini:"b",groq:"c"})), {claude:"a",gemini:"b",groq:"c"});
t("tolerates legacy single-key blob", parseKeyPayload("sk-ant-old"), {claude:"sk-ant-old",gemini:"",groq:""});

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " logic tests passed");
process.exit(fail ? 1 : 0);
