/* Words picked up by accident used to become questions, and the model - told
   to do jokes and stories properly - would improvise one. "I said Pedro and it
   said Adam I have got a problem my phone is broken" came from exactly that. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
/* braces live inside strings and regexes, so the shared reader asks the
   JavaScript engine which slice is whole rather than guessing */
const { grab, decl } = require("./lib").reader(src);

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

/* worthAnswering asks isACommand first, and that reads every command pattern,
   so the harness has to carry all of them */
const COMMAND_PATTERNS = ["BUILD_MODE_RE", "OPEN_RE", "CLOSE_RE", "HIDE_RE", "STOP_RE",
  "PAUSE_RE", "RESUME_RE", "VIZ_RE", "VIZ_HINT_RE", "STUDY_RE", "UNSTUDY_RE", "EDIT_RE",
  "UNDO_RE", "TIMER_RE", "COIN_RE", "DICE_RE", "CAM_RE", "REMEMBER_RE",
  "FORGET_RE", "HIGHLIGHT_RE"];
const worth = new Function("appNamed",
  COMMAND_PATTERNS.map(decl).join("\n") + "\n" +
  decl("PEDRO_PANELS") + "\n" +
  decl("NOW_RE") + "\n" +
  decl("HF_FILLER") + "\n" + decl("HF_SHORT_ASK") + "\n" +
  grab("isACommand") + "\n" + grab("worthAnswering") +
  "\n return worthAnswering;")(function(){ return null; });

/* things actually said to him */
[["what is the capital of france"], ["tell me a joke"], ["how does an engine work"],
 ["why"], ["how come"], ["again"], ["really"], ["what about the sun"],
 ["carry on"], ["yes"], ["no"], ["stop"], ["and the moon"]
].forEach(([q]) => t('"' + q + '" is answered', worth(q), true));

/* things picked up by accident */
[["uh"], ["um"], ["uh um"], ["hmm"], ["yeah"], ["ok"], ["okay"], ["right"],
 ["so"], ["like"], ["the"], ["a"], ["and"], ["hi"], ["hey"], ["yo"],
 ["ok so like"], ["um yeah ok"], ["mm hmm"], [""], ["   "], ["..."]
].forEach(([q]) => t('"' + q + '" is let go', worth(q), false));

/* a single stray word is not a question, but three words probably are */
t("one stray word is ignored", worth("engine"), false);
t("two stray words are ignored", worth("engine thing"), false);
t("three words are taken seriously", worth("the engine broke"), true);

/* it must not have got so strict that ordinary things stop working */
t("a short follow-up still works", worth("why not"), true);
t("so does a one word answer to his question", worth("yes"), true);

/* where it is used */
{
  const has = s => src.indexOf(s) > -1;
  t("a settled noise is dropped rather than asked",
    grab("hfSettle").indexOf("worthAnswering(q)") > -1, true);
  t("a finished noise is dropped too",
    grab("hfHeardText").indexOf("worthAnswering(finalTxt)") > -1, true);
  t("and he does not start thinking about one",
    grab("draftable").indexOf("worthAnswering(s)") > -1, true);
  t("dropping one leaves him listening, not stuck",
    grab("hfSettle").indexOf("hfQuietTimer()") > -1, true);
  t("the model is told what to do when the words do not add up",
    has("say you did not catch that and stop"), true);
  t("and told not to make something up instead",
    has("Never invent a situation"), true);
}

/* ---- a command is never noise, however short ---- */
{
  /* these were all being thrown away as if they were ums */
  ["build", "settings", "open settings", "building mode", "teach", "workbench",
   "stop", "pause", "close", "undo that change", "flip a coin"]
    .forEach(c => t('"' + c + '" is a command, not noise', worth(c), true));
  ["um yeah", "the", "uh", "ok so like", ""]
    .forEach(c => t('"' + c + '" is still let go', worth(c), false));
}

/* ---- his own screens, not the phone's ---- */
{
  const has = x => src.indexOf(x) > -1;
  t("settings means his settings", has('settings:"settings", setting:"settings"'), true);
  t("and they are actually opened", src.indexOf("openPanel(panel)") > -1, true);
  t("the phone's own settings are not attempted",
    src.indexOf('return "App-Prefs:"') === -1, true);
  t("because Apple does not allow it, and that is written down",
    has("App-Prefs: is private"), true);
}

/* ---- the voice is chosen, not guessed ----
   A voice id written into this file is a guess about somebody else's account:
   if it is not in theirs, every sentence fails and he falls back to the phone.
   The account is asked instead, and what comes back is ranked. */
{
  const { decl: declIt, grab: grabIt } = require("./lib").reader(src);
  const voices = new Function(declIt("ELEVEN_VOICES") + " return ELEVEN_VOICES;")();
  t("nothing is assumed about anyone else's account", voices.length, 0);
  t("only the one he asked for is written in, and only in two places",
    (src.match(/wDsJlOXPqcvIUKdLXjDs/g) || []).length <= 3, true);
  /* wDsJlOXPqcvIUKdLXjDs is the one Adam asked for by id, from his own
     account. The one that used to be forced on every start is still gone. */
  t("the forced one is gone", src.indexOf("Pno1sSZ9LihyDUpvtooA") === -1, true);
  t("and is not the default", src.indexOf('elevenVoice:"IKne3meq5aSn9XLyUdCD"') === -1, true);
  t("a phone that had one forced on it is cleared",
    src.indexOf('store.settings.elevenVoice === "IKne3meq5aSn9XLyUdCD"') > -1, true);
  t("and the line that overwrote the choice on every start is gone",
    src.indexOf('store.settings.elevenVoice !== "IKne3meq5aSn9XLyUdCD"') === -1, true);

  /* the ranking itself */
  const score = new Function(declIt("JARVIS_FIRST") + grabIt("voiceScore") + " return voiceScore;")();
  const v = (name, accent, gender, about) =>
    ({ name, labels: { accent, gender, description: about || "" } });
  t("a British man outranks an American one",
    score(v("Daniel","british","male")) > score(v("Josh","american","male")), true);
  t("and outranks a British woman",
    score(v("Daniel","british","male")) > score(v("Alice","british","female")), true);
  t("calm and authoritative beats excitable",
    score(v("A","british","male","calm authoritative")) >
    score(v("B","british","male","excited energetic")), true);
  t("a voice with no labels at all still scores something",
    typeof score({ name:"Whoever" }), "number");
  t("and the whole list is asked for, not assumed",
    grabIt("elevenList").indexOf("api.elevenlabs.io/v1/voices") > -1, true);
  t("a refusal is not remembered forever",
    grabIt("elevenList").indexOf("elevenListed = null") > -1, true);
  t("one already chosen by hand is kept",
    grabIt("elevenChooseVoice").indexOf("store.settings.elevenVoice &&") > -1, true);

  /* the phone's own voice, for no key and no signal */
  const phone = new Function("store", declIt("PHONE_BRITISH") + declIt("PHONE_MALE") +
    grabIt("voiceIsGood") + grabIt("voiceIsBritish") + grabIt("phoneScore") +
    " return phoneScore;")({ settings:{ manner:"jarvis" } });
  const pv = (name, lang) => ({ name, lang: lang || "en-US" });
  t("Daniel is the one on an iPhone", phone(pv("Daniel","en-GB")) > phone(pv("Samantha","en-US")), true);
  t("a British voice beats an American one", phone(pv("Arthur","en-GB")) > phone(pv("Alex","en-US")), true);
  t("and Enhanced still counts for something",
    phone(pv("Alex (Enhanced)","en-US")) > phone(pv("Fred","en-US")), true);
}

/* ---- typing instead of speaking ---- */
{
  const has = x => src.indexOf(x) > -1;
  t("there is a box to type in", has('id="hfTypeBox"'), true);
  t("it sits at the bottom", has("#hfType{position:fixed"), true);
  t("its text is big enough that the phone does not zoom in on it",
    has("#hfTypeBox{") && /#hfTypeBox{[^}]*font-size:16px/.test(src), true);
  t("what is typed goes where what is heard goes", has("hfAsk(said)"), true);
  t("and is never mistaken for a noise picked up", has("typing is deliberate"), true);
  t("the microphone stands down while you type", has("if(hf.phase === ") && has("hfPause()"), true);
  t("the transcript is no longer on the dashboard",
    /data-panel="transcript" hidden/.test(src), true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " misheard-speech tests passed");
process.exit(fail ? 1 : 0);
