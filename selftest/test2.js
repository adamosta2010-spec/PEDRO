global.window = {};
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
const names = ["providerLabel","apiErrorBody","noKeyYet","trimImages","memories","recallFor","isDevice","inApp","isGemini","isGroq","isLocal","isOpenAIStyle","allKeys","apiKeyNow","systemPrompt","taughtBlock","pickLessons","relevance","lessons","facts","claudeContent","geminiParts",
               "claudeRequest","geminiRequest","buildRequest","wantsPicture","esc","shots"];
let store = { settings:{ provider:"gemini", aiName:"Pedro", apiKey:"sk-x", geminiKey:"AIzaTEST",
  model:"claude-opus-5", geminiModel:"gemini-2.5-flash", imageModel:"gemini-2.5-flash-image",
  effort:"low", groqKey:"", groqModel:"llama-3.3-70b-versatile", localUrl:"http://localhost:11434", localModel:"qwen2.5:7b", name:"Adam", about:"", facts:[], lessons:[], memories:[] } };
let voiceMode = false, imgMode = false;
const isLocked = () => false;
/* DRAW_RE lives at module scope in the app */
const DRAW_SRC = src.match(/var DRAW_RE = (\/.*\/i);/)[1];
eval("var DRAW_RE = " + DRAW_SRC + ";");
eval(names.map(grab).join("\n"));

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

const IMG = { mime:"image/jpeg", data:"AAAA" };

/* ---- image payloads ---- */
t("gemini photo part", geminiParts({role:"user",content:"what is this",images:[IMG]}),
  [{inline_data:{mime_type:"image/jpeg",data:"AAAA"}},{text:"what is this"}]);
t("gemini photo with no caption", geminiParts({role:"user",content:"",images:[IMG]}),
  [{inline_data:{mime_type:"image/jpeg",data:"AAAA"}}]);
t("gemini text only stays a plain part", geminiParts({role:"user",content:"hi"}), [{text:"hi"}]);
t("gemini never sends an empty parts array", geminiParts({role:"user",content:""}), [{text:""}]);

t("claude photo content", claudeContent({role:"user",content:"what is this",images:[IMG]}),
  [{type:"image",source:{type:"base64",media_type:"image/jpeg",data:"AAAA"}},{type:"text",text:"what is this"}]);
t("claude text stays a string", claudeContent({role:"user",content:"hi"}), "hi");

/* images survive into the real request bodies */
const withPhoto = [{role:"user",content:"describe",images:[IMG]}];
t("gemini request carries the photo",
  buildRequest(withPhoto).body.contents[0].parts[0].inline_data.data, "AAAA");
store.settings.provider = "claude";
t("claude request carries the photo",
  buildRequest(withPhoto).body.messages[0].content[0].source.data, "AAAA");
store.settings.provider = "gemini";

/* ---- picture-request detection ---- */
t("draw me a picture", wantsPicture("draw me a picture of a fox"), true);
t("generate an image", wantsPicture("generate an image of a castle"), true);
t("make me a logo", wantsPicture("make me a logo for my game"), true);
t("normal question is not a draw", wantsPicture("what is the capital of Peru"), false);
t("asking about a picture is not a draw", wantsPicture("what is in this picture"), false);
t("code question is not a draw", wantsPicture("create a function that sorts an array"), false);
store.settings.provider = "claude";
t("claude never auto-draws", wantsPicture("draw me a picture of a fox"), false);
store.settings.provider = "gemini";
imgMode = true;
t("manual picture mode forces it", wantsPicture("a red bicycle"), true);
imgMode = false;

/* ---- rendering ---- */
t("no images renders nothing", shots({content:"hi"}), "");
const html = shots({content:"", images:[IMG]});
t("single image gets the wide class", html.includes('class="shots one"'), true);
t("image src is a data url", html.includes('src="data:image/jpeg;base64,AAAA"'), true);
t("two images use the grid", shots({images:[IMG,IMG]}).includes('class="shots"'), true);
t("image data is escaped", shots({images:[{mime:'x"onerror="alert(1)',data:"A"}]}).includes('onerror="'), false);

/* ---- prompt ---- */
const p = systemPrompt();
t("prompt covers code", p.includes("runnable code") && p.includes("fenced block"), true);
t("prompt covers photos", p.includes("photo"), true);


/* ---- what actually gets read aloud ---- */
/* Asking what two plus two is came back spoken as "maths, four", because
   stripping a heading's hashes left the word behind. */
{
  const P = new Function(grab("plain") + "; return plain;")();
  t("a heading is not read aloud", P("## Maths" + String.fromCharCode(10) + "4"), "4");
  t("a bold line used as a heading is not either",
    P("**Maths**" + String.fromCharCode(10) + "4"), "4");
  t("a bold sentence is still read", P("**It is four.**"), "It is four.");
  t("an ordinary answer is untouched", P("The answer is 4."), "The answer is 4.");
  t("the answer under a heading survives",
    P("### Answer" + String.fromCharCode(10) + "2 + 2 = 4"), "2 + 2 = 4");
  t("code is not read out character by character",
    P("Here is code:" + String.fromCharCode(10) + "```js" + String.fromCharCode(10) + "x" +
      String.fromCharCode(10) + "```").indexOf("code block") > -1, true);
  t("nothing at all is safe", P(""), "");
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " media tests passed");
process.exit(fail ? 1 : 0);
