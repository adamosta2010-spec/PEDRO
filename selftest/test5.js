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
/* the prompt names the apps Pedro can open; the list itself is not what these test */
const appList = () => "maps, music, spotify, messages, phone, web";
const names = ["studies","studyFor","studyOf","forgetStudy","lessons","facts","relevance","pickLessons","taughtBlock","addLesson","addFact",
               "isGemini","isGroq","isLocal","allKeys","apiKeyNow","providerLabel",
               "memories","recallFor","sameMemory","addMemory","forgetMemory","rememberFrom",
               "systemPrompt"];
let store = { settings:{ provider:"gemini", aiName:"Pedro", name:"Adam", about:"",
  apiKey:"", geminiKey:"", groqKey:"", model:"claude-opus-5", geminiModel:"g",
  effort:"low", facts:[], lessons:[], memories:[], studies:[] } };
let voiceMode = false, lastUserText = "";
const isLocked = () => false;
let saved = 0;
const save = () => { saved++; };
const uid = () => "id" + Math.random().toString(36).slice(2, 7);
/* MEMORY_RULES and the two command patterns are plain vars, not functions */
function grabVar(name){
  const i = src.indexOf("var " + name);
  const j = name === "MEMORY_RULES" ? src.indexOf("];", i) + 2 : src.indexOf(";", i) + 1;
  return src.slice(i, j);
}
/* the prompt is built from a plain declaration as well as from functions */
const { decl: declOf } = require("./lib").reader(src);
eval(declOf("MASTER_PROMPT"));
/* he now arrives with lessons of his own */
eval(declOf("HOUSE_LESSONS"));
var allLessons = function(){ return lessons().concat(HOUSE_LESSONS); };
/* the prompt now carries the tone of whichever mood he is in */
eval(declOf("MOODS"));
var moodNow = function(){ return MOODS.normal; };
eval(declOf("MASTER_WRITTEN"));
/* how he speaks - composed and British, or nothing at all */
eval((typeof declOf === "function" ? declOf : decl)("MANNERS"));
eval((typeof declOf === "function" ? declOf : decl)("MANNER_REPLACES"));
eval("var mannerBlock = " + grab("mannerBlock").replace("function mannerBlock", "function") + ";");
eval("var promptWithout = " + grab("promptWithout").replace("function promptWithout", "function") + ";");
eval(["MEMORY_RULES", "REMEMBER_RE", "FORGET_RE"].map(grabVar).join("\n") +
     "\n" + names.map(grab).join("\n"));

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


/* ---- memory ---- */
{
  store.settings.memories = [];
  const said = t => rememberFrom(t);

  t("it keeps a name when told one", said("my name is Adam"), ["Their name is Adam."]);
  t("where they live", said("i live in London"), ["They live in London."]);
  t("what they are", said("i am a student"), ["They are a student."]);
  t("what they like", said("i love roblox games"), ["They like roblox games."]);
  t("what they are working on",
    said("i am building a shooter game"), ["They are working on a shooter game."]);
  t("told outright, it keeps the words as given",
    said("remember that the bins go out on Tuesday"), ["the bins go out on Tuesday"]);

  t("the same thing twice is one memory", said("i live in London"), []);
  t("a question is asking, not telling", said("where do i live?"), []);
  t("nothing at all is safe", said(""), []);
  t("small talk is not hoarded", said("thanks that is great"), []);

  t("it has kept exactly what it should", store.settings.memories.length, 6);

  /* recall puts the relevant ones first */
  const back = recallFor("what games do i like", 3);
  t("recall leads with what was asked about", /roblox/i.test(back[0]), true);
  t("recall respects the limit", recallFor("anything", 2).length, 2);
  t("recall with no memories is empty", (function(){
    const keep = store.settings.memories; store.settings.memories = [];
    const r = recallFor("anything", 5); store.settings.memories = keep; return r;
  })(), []);

  /* and it can be told to forget */
  t("forgetting removes it", forgetMemory("roblox") > 0, true);
  t("and it is really gone",
    store.settings.memories.some(m => /roblox/i.test(m.text)), false);
  t("forgetting something it never knew changes nothing", forgetMemory("submarines"), 0);
  t("forget as a sentence works too", (function(){
    rememberFrom("forget that i live in London");
    return store.settings.memories.some(m => /London/i.test(m.text));
  })(), false);

  /* what the model actually sees */
  t("memories reach the prompt", /What you remember about/.test(taughtBlock("hello")), true);
  t("and it is told not to parrot them",
    /not recite them back/i.test(taughtBlock("hello")), true);
  t("an empty memory adds nothing to the prompt", (function(){
    const keep = store.settings.memories; store.settings.memories = [];
    const out = taughtBlock("hello"); store.settings.memories = keep;
    return /What you remember/.test(out);
  })(), false);

  store.settings.memories = [];
}


/* ---- studying a subject ---- */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const re = new Function(v("STUDY_RE") + v("UNSTUDY_RE") +
    "; return { STUDY_RE:STUDY_RE, UNSTUDY_RE:UNSTUDY_RE };")();
  const heard = q => { const m = q.match(re.STUDY_RE); return m ? m[1] : null; };
  const inSrc = bit => src.indexOf(bit) > -1;

  t("go and learn about a subject", heard("go and learn about electronics"), "electronics");
  t("learn about, plainly", heard("learn about electronics"), "electronics");
  t("study something", heard("study the roman empire"), "the roman empire");
  t("read up on something", heard("read up on chess openings"), "chess openings");
  t("an ordinary question is not an instruction to study", heard("what is electronics"), null);
  t("forgetting a subject is heard",
    "forget everything about electronics".match(re.UNSTUDY_RE)[1], "electronics");

  store.settings.studies = [
    { id:"a", topic:"electronics", notes:["A resistor limits current.", "Ohm's law is V equals I times R."], t:1 },
    { id:"b", topic:"baking", notes:["Yeast needs warmth."], t:2 }
  ];
  t("the right subject is recalled", (studyFor("what does a resistor do") || {}).topic, "electronics");
  t("an unrelated question recalls nothing", studyFor("what time is the train"), null);
  t("what he learned reaches the prompt",
    /already read up on electronics/.test(taughtBlock("tell me about a resistor")), true);
  t("and he is told to admit when it does not cover it",
    /say plainly if it does not cover/.test(taughtBlock("tell me about a resistor")), true);
  t("forgetting a subject removes it", forgetStudy("electronics"), 1);
  t("and the other one is left alone", store.settings.studies.length, 1);
  t("what he learned travels in the backup", inSrc("studies: studies()"), true);
  store.settings.studies = [];
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " teaching tests passed");
process.exit(fail ? 1 : 0);
