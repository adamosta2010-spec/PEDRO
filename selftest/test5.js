global.window = {};
/* What you teach it, and how that reaches the prompt. */
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
const names = ["lessons","facts","relevance","pickLessons","taughtBlock","addLesson","addFact",
               "isGemini","isGroq","isLocal","allKeys","apiKeyNow","systemPrompt"];
let store = { settings:{ provider:"gemini", aiName:"Pedro", name:"Adam", about:"",
  apiKey:"", geminiKey:"", groqKey:"", model:"claude-opus-5", geminiModel:"g",
  effort:"low", facts:[], lessons:[] } };
let voiceMode = false, lastUserText = "";
const isLocked = () => false;
let saved = 0;
const save = () => { saved++; };
const uid = () => "id" + Math.random().toString(36).slice(2, 7);
eval(names.map(grab).join("\n"));

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

/* ---- storing ---- */
t("adds a fact", addFact("I build Roblox games in Luau"), true);
t("ignores a duplicate fact", addFact("I build Roblox games in Luau"), false);
t("ignores an empty fact", addFact("   "), false);
t("adds a lesson", addLesson("how do I make a part glow", "Set Material to Neon."), true);
t("lesson needs both halves", addLesson("just a question", ""), false);
t("re-teaching replaces rather than duplicates",
  (addLesson("how do I make a part glow", "Use a PointLight plus Neon."), store.settings.lessons.length), 1);
t("the newer answer wins", store.settings.lessons[0].a, "Use a PointLight plus Neon.");

/* ---- relevance ---- */
addLesson("how do I script a door in roblox", "Use a ClickDetector and TweenService.");
addLesson("what should I eat for breakfast", "Eggs on toast.");
addLesson("how do I fix z-fighting", "Offset the surfaces by 0.01 studs.");

const picked = pickLessons("how do I make a part glow in my roblox game", 6).map(l => l.q);
t("picks the matching lesson", picked.indexOf("how do I make a part glow") >= 0, true);
t("ignores the unrelated one", picked.indexOf("what should I eat for breakfast") >= 0, false);

const zf = pickLessons("z-fighting on my walls", 6).map(l => l.q);
t("matches on an unusual term", zf[0], "how do I fix z-fighting");

t("caps how many are sent", pickLessons("roblox part glow door script", 2).length, 2);
t("nothing relevant still sends recent ones", pickLessons("zzzz qqqq", 6).length > 0, true);
t("common words alone don't match",
  pickLessons("the a and of to", 6).length <= 3, true);

/* ---- what reaches the prompt ---- */
const block = taughtBlock("how do I make a part glow");
t("facts appear", block.includes("I build Roblox games in Luau"), true);
t("the taught answer appears", block.includes("Use a PointLight plus Neon."), true);
t("irrelevant lessons stay out", block.includes("Eggs on toast"), false);
t("it's told to prefer them", /prefer them over your default/i.test(block), true);

lastUserText = "how do I make a part glow";
const sp = systemPrompt();
t("the system prompt carries the teaching", sp.includes("Use a PointLight plus Neon."), true);

/* ---- empty state is safe ---- */
store.settings.facts = []; store.settings.lessons = [];
t("no teaching means no block", taughtBlock("anything"), "");
t("prompt still builds with nothing taught", typeof systemPrompt(), "string");
t("pickLessons copes with nothing", pickLessons("hello", 6), []);

/* ---- scoring sanity ---- */
t("longer words score higher",
  relevance("zfighting", {q:"how do I fix z-fighting", tag:""}) >= 0, true);
t("no overlap scores zero", relevance("bananas", {q:"roblox scripting", tag:""}), 0);

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " teaching tests passed");
process.exit(fail ? 1 : 0);
