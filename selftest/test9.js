/* Thinking while you are still talking. The head start is only worth having if
   it is thrown away when the question changes, and never taken for anything
   that DOES something - starting a build twice would be a real bug. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
/* braces live inside strings and regexes, so the shared reader asks the
   JavaScript engine which slice is a whole function rather than guessing */
const { grab, decl } = require("./lib").reader(src);

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

/* long declarations full of semicolons - scan with the quotes in mind */
function declOf(name){
  const i = src.indexOf("var " + name + " =");
  if(i < 0) throw new Error("no declaration: " + name);
  let q = null, depth = 0;
  for(let k = i; k < src.length; k++){
    const ch = src[k];
    if(q){ if(ch === String.fromCharCode(92)) k++; else if(ch === q) q = null; continue; }
    if(ch === "'" || ch === '"'){ q = ch; continue; }
    if(ch === "(" || ch === "[" || ch === "{") depth++;
    else if(ch === ")" || ch === "]" || ch === "}") depth--;
    else if(ch === ";" && depth === 0) return src.slice(i, k + 1);
  }
  throw new Error("unterminated: " + name);
}

const keyOf = new Function(grab("draftKey") + " return draftKey;")();
const fits  = new Function(grab("draftKey") + grab("draftFits") + " return draftFits;")();

/* ---- what counts as the same question ---- */
t("the same words match", fits(keyOf("what is the capital of france"),
  "What is the capital of France?"), true);
t("punctuation and case do not matter",
  fits(keyOf("hows the weather"), "How's the weather?"), true);
t("a tidy-up word on the end is still the same question",
  fits(keyOf("what is the capital of france"), "what is the capital of france please"), true);
t("two extra words are still allowed",
  fits(keyOf("tell me about rome"), "tell me about rome for me"), true);
t("but a second question is not",
  fits(keyOf("what is the capital of france"),
       "what is the capital of france and what is the population"), false);
t("nor is a change of direction",
  fits(keyOf("how tall is everest"), "how tall is everest not k2"), false);
t("nor a long tail",
  fits(keyOf("what is a diode"), "what is a diode in a simple circuit with a battery"), false);
t("a different question does not match",
  fits(keyOf("what is the capital of france"), "who wrote hamlet"), false);
t("a shorter question does not match a longer draft",
  fits(keyOf("what is the capital of france and germany"), "what is the capital"), false);
t("an empty draft matches nothing", fits("", "anything at all"), false);
t("an empty question matches nothing", fits(keyOf("something here"), ""), false);

/* ---- what he is allowed to start early ---- */
function canDraft(text, world){
  world = world || {};
  const fn = new Function(
    "DRAFT_WORDS", "isDevice", "isGemini", "apiKeyNow", "hf", "wb", "cam", "viz",
    "VIZ_RE", "VIZ_HINT_RE", "BUILD_MODE_RE", "STUDY_RE", "UNSTUDY_RE", "EDIT_RE", "UNDO_RE",
    "OPEN_RE", "CLOSE_RE", "HIDE_RE", "STOP_RE", "PAUSE_RE", "RESUME_RE", "TIMER_RE",
    "COIN_RE", "DICE_RE", "CAM_RE", "DRAW_RE", "REMEMBER_RE", "FORGET_RE", "HIGHLIGHT_RE",
    declOf("HF_FILLER") + "\n" + declOf("HF_SHORT_ASK") + "\n" +
    grab("worthAnswering") + "\n" + grab("draftKey") + grab("draftable") +
    " return draftable;");
  const pat = n => new Function(src.match(new RegExp("var " + n + "\\s*=[\\s\\S]*?;\\s*(?:\\r?\\n)"))[0] +
    " return " + n + ";")();
  return fn(
    3,
    () => !!world.device, () => world.gemini !== false, () => world.key !== false,
    Object.assign({ answering:false, talking:false }, world.hf || {}),
    { on: !!world.wb }, { open: !!world.cam }, { busy: !!world.viz },
    pat("VIZ_RE"), pat("VIZ_HINT_RE"), pat("BUILD_MODE_RE"), pat("STUDY_RE"), pat("UNSTUDY_RE"),
    pat("EDIT_RE"), pat("UNDO_RE"), pat("OPEN_RE"), pat("CLOSE_RE"), pat("HIDE_RE"),
    pat("STOP_RE"), pat("PAUSE_RE"), pat("RESUME_RE"), pat("TIMER_RE"), pat("COIN_RE"),
    pat("DICE_RE"), pat("CAM_RE"), pat("DRAW_RE"), pat("REMEMBER_RE"), pat("FORGET_RE"),
    pat("HIGHLIGHT_RE"))(text);
}

t("an ordinary question gets a head start",
  canDraft("what is the capital of france"), true);
t("so does a longer one",
  canDraft("explain how a petrol engine works to me"), true);
t("two words is not a question yet", canDraft("the weather"), false);
t("and neither is a noise picked up in passing", canDraft("um yeah ok"), false);
t("nothing at all is not either", canDraft(""), false);

/* the important half: things that DO something must never run twice */
[["build me an engine", "building"],
 ["simulate a volcano", "simulating"],
 ["build", "building mode"],
 ["go learn about electronics", "learning"],
 ["set a timer for 5 minutes", "a timer"],
 ["flip a coin", "a coin"],
 ["roll a dice", "a dice"],
 ["open settings", "opening something"],
 ["close that", "closing something"],
 ["stop", "stopping"],
 ["pause", "pausing"],
 ["pedro text mum i am on my way", "texting"],
 ["change your code so the orb is red", "editing himself"],
 ["undo that change", "undoing"],
 ["remember that i hate coriander", "remembering"],
 ["look at this", "the camera"]
].forEach(([say, what]) => t("no head start for " + what, canDraft(say), false));

t("not while the workbench is open", canDraft("what is the capital of france", { wb:true }), false);
t("not while the camera is open", canDraft("what is the capital of france", { cam:true }), false);
t("not while a build is running", canDraft("what is the capital of france", { viz:true }), false);
t("not while he is already talking",
  canDraft("what is the capital of france", { hf:{ talking:true } }), false);
t("not while he is saying yeah",
  canDraft("what is the capital of france", { hf:{ answering:true } }), false);
t("not with no key", canDraft("what is the capital of france", { key:false }), false);
t("not on the phone's own model", canDraft("what is the capital of france", { device:true }), false);
t("not on a provider that cannot stream",
  canDraft("what is the capital of france", { gemini:false }), false);

/* ---- how it is wired in ---- */
{
  const has = s => src.indexOf(s) > -1;
  const ask = grab("hfAsk");
  t("the words being heard start him thinking",
    grab("hfHeardText").indexOf("hfDraftHint(live)") > -1, true);
  t("there is a beat before he starts, not on every syllable",
    /420/.test(grab("hfDraftHint")), true);
  t("a draft says nothing by itself", grab("hfDraftStart").indexOf("sayChunk") === -1, true);
  t("and it does not touch the saved conversation",
    grab("hfDraftStart").indexOf("base.messages.concat") > -1, true);
  t("nor does it save anything", grab("hfDraftStart").indexOf("save()") === -1, true);
  t("it is shaped like a spoken answer", grab("hfDraftStart").indexOf("voiceMode = true") > -1, true);
  t("a question that does not fit the draft throws it away",
    ask.indexOf("if(hf.draft && (!draftable(question) || !draftFits(hf.draft.key, question))) hfDropDraft();") > -1, true);
  t("a reply that never went to the model drops it too",
    grab("carryOn").indexOf("hfDropDraft()") > -1, true);
  t("a draft that fits is used instead of asking again",
    ask.indexOf("run = draft.p") > -1, true);
  t("and whatever is already written is spoken at once",
    ask.indexOf("if(draft.acc) outLoud(draft.acc)") > -1, true);
  t("the rest is still spoken sentence by sentence",
    ask.indexOf("var done = wholeSentences(acc)") > -1, true);
  /* the bug this caught: hfAsk pauses the microphone before it thinks, so
     dropping the draft inside hfPause threw away every head start at once */
  t("pausing the microphone does not throw the head start away",
    grab("hfPause").indexOf("hfDropDraft()") === -1, true);
  t("but saying stop does", /hfDropDraft\(\);\s*viz\.busy = false;/.test(src), true);
  t("and so does turning listening off",
    /hfPause\(\);\s*hfDropDraft\(\);/.test(src), true);
  t("there is a cap on restarts", has("DRAFT_TRIES"), true);
  t("and the cap resets for each question", ask.indexOf("hf.draftTries = 0") > -1, true);
  t("a dropped draft is cancelled, not left running",
    grab("hfDropDraft").indexOf("ctl.abort()") > -1, true);
  t("askStream can be given something to cancel it with",
    /function askStream\(c, onText, ctl\)/.test(src), true);
  t("and still makes its own when it is not",
    grab("askStream").indexOf("ctl || new AbortController()") > -1, true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " head-start tests passed");
process.exit(fail ? 1 : 0);
