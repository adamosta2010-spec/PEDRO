/* JARVIS: how he speaks, what he sounds like, and what he says without being
   asked. The manner and the voice are separate things and are checked
   separately - a British voice reading American filler is not the character,
   and neither is the right words in the wrong voice. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8")
  .split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const { grab, decl } = require("./lib").reader(src);
const NL = String.fromCharCode(10);

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + NL + "  got:  " + JSON.stringify(g) +
                               NL + "  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};
const has = s => src.indexOf(s) > -1;

/* ---------- how he speaks ---------- */
{
  const MANNERS = new Function(decl("MANNERS") + " return MANNERS;")();
  const block = new Function("store", decl("MANNERS") + grab("mannerBlock") +
    " return mannerBlock;");

  t("there is a manner", !!MANNERS.jarvis, true);
  t("and a way to have none of it", MANNERS.plain, "");
  t("it is on unless it is turned off", block({ settings:{} })().length > 40, true);
  t("turning it off leaves nothing behind", block({ settings:{ manner:"plain" } })(), "");
  t("something unrecognised falls back to it rather than to nothing",
    block({ settings:{ manner:"wobble" } })().length > 40, true);

  const m = MANNERS.jarvis.toLowerCase();
  t("he calls them sir", m.indexOf("sir") > -1, true);
  t("but not in every sentence", m.indexOf("not every sentence") > -1, true);
  t("he is brief", m.indexOf("brief") > -1, true);
  t("British", m.indexOf("british") > -1, true);
  t("the fact comes before what it means", m.indexOf("fact first") > -1, true);
  t("he does not gush", m.indexOf("never gush") > -1, true);
  t("nor open with Certainly", m.indexOf("certainly") > -1, true);
  t("nor offer further help at the end", m.indexOf("offering further help") > -1, true);
  t("and he gets calmer under pressure, not louder", m.indexOf("not louder") > -1, true);

  /* It is sent with every single spoken question, so its size is time before
     he starts talking. Two sections of the master prompt say the same things
     and one says the opposite, so they come out while it is on. */
  t("it is short enough to send every time", MANNERS.jarvis.length < 800, true);
  const REPLACES = new Function(decl("MANNER_REPLACES") + " return MANNER_REPLACES;")();
  const without = new Function(grab("promptWithout") + " return promptWithout;")();
  const MASTER = new Function(decl("MASTER_PROMPT") + " return MASTER_PROMPT;")();
  const cut = without(MASTER, REPLACES);
  t("the section that says be energetic comes out", cut.indexOf("energetic") === -1, true);
  t("and the one that repeats do not say Sure", cut.indexOf("Do not open with Sure") === -1, true);
  t("thinking stays", cut.indexOf("THINKING") > -1, true);
  t("so does what makes a good answer", cut.indexOf("ANSWERS") > -1, true);
  t("and safety", cut.indexOf("SAFETY") > -1, true);
  t("and the last paragraph is not swallowed with the section before it",
    cut.indexOf("It is to work out what they are trying to do") > -1, true);
  t("nothing inside a section it keeps is edited",
    cut.indexOf("Think before answering.") > -1, true);
  t("with the manner, the spoken prompt is no bigger than it was",
    cut.length + MANNERS.jarvis.length < MASTER.length + 200, true);
  t("and turning the manner off gives his prompt back word for word",
    grab("systemPrompt").indexOf("if(manner) base = promptWithout") > -1, true);

  t("he speaks in it out loud", grab("systemPrompt").indexOf("var manner = mannerBlock()") > -1, true);
  t("and writes in it too", grab("systemPrompt").indexOf("MASTER_WRITTEN + mannerBlock()") > -1, true);
}

/* ---------- what he sounds like ---------- */
{
  /* A voice id typed into this file is a guess about somebody else's account.
     If it is not in theirs, every sentence fails over to the phone's voice and
     nothing says why. The account is asked instead. */
  t("no voice is assumed", has('elevenVoice:""'), true);
  t("their account is asked what it holds", has("api.elevenlabs.io/v1/voices"), true);
  t("only once", grab("elevenList").indexOf("if(elevenListed) return elevenListed") > -1, true);
  t("but a bad signal is not remembered forever",
    grab("elevenList").indexOf("elevenListed = null") > -1, true);
  t("a voice already chosen by hand is kept",
    grab("elevenChooseVoice").indexOf("list.some") > -1, true);
  t("and nothing is spoken in a voice that was never chosen",
    grab("elevenFetch").indexOf("still choosing a voice") > -1, true);

  const score = new Function(decl("JARVIS_FIRST") + grab("voiceScore") + " return voiceScore;")();
  const v = (name, accent, gender, about) =>
    ({ name, labels: { accent, gender, description: about || "" } });
  t("British beats American", score(v("A","british","male")) > score(v("B","american","male")), true);
  t("male beats female for this one", score(v("A","british","male")) > score(v("B","british","female")), true);
  t("calm and authoritative beats excitable",
    score(v("A","british","male","calm authoritative")) >
    score(v("B","british","male","excited energetic")), true);
  t("Daniel is preferred among equals",
    score(v("Daniel","british","male")) > score(v("Nigel","british","male")), true);
  t("a voice with no labels still gets a number",
    typeof score({ name: "Whoever" }), "number");
  t("the labels do more of the work than the names, so a new voice ranks properly",
    score(v("Unheard-of","british","male")) > score(v("Daniel","american","female")), true);

  /* the phone's own, for no key and no signal */
  const phone = new Function("store", decl("PHONE_BRITISH") + decl("PHONE_MALE") +
    grab("voiceIsGood") + grab("voiceIsBritish") + grab("phoneScore") + " return phoneScore;");
  const jar = phone({ settings:{ manner:"jarvis" } });
  const pln = phone({ settings:{ manner:"plain" } });
  const pv = (name, lang) => ({ name, lang: lang || "en-US" });
  t("Daniel is the one every iPhone has", jar(pv("Daniel","en-GB")) > jar(pv("Samantha","en-US")), true);
  t("Google's UK male counts too, so this works on a computer",
    jar(pv("Google UK English Male","en-GB")) > jar(pv("Google US English","en-US")), true);
  t("Enhanced still counts for something",
    jar(pv("Alex (Enhanced)","en-US")) > jar(pv("Fred","en-US")), true);
  t("with the manner off, British stops mattering",
    pln(pv("Daniel","en-GB")), pln(pv("Fred","en-US")));
  /* filtering on British first meant a phone with no British voice at all got
     nothing and fell back to the robot - so it is ranked, not filtered */
  t("it is a ranking, not a filter", grab("pickVoice").indexOf("ranked[0]") > -1, true);

  const MOODS = new Function(decl("MOODS") + " return MOODS;")();
  t("there is a level setting for the voice itself", !!MOODS.composed, true);
  t("steadier than the ordinary one", MOODS.composed.stability > MOODS.normal.stability, true);
  t("and less of a performance", MOODS.composed.style < MOODS.normal.style, true);
  t("it says nothing extra in the prompt - the manner already did", MOODS.composed.tone, "");
  const moodNow = new Function("store", decl("MOODS") + grab("moodNow") + " return moodNow;");
  t("it is what he starts in", moodNow({ settings:{} })().say, "composed");
  t("and with the manner off he starts ordinary",
    moodNow({ settings:{ manner:"plain" } })().say, "normal");
  t("asking for it by name works",
    new Function("store","save", decl("MOODS") + grab("moodSet") + " return moodSet;")
      ({ settings:{} }, function(){})("jarvis").say, "composed");
}

/* ---------- what he says without being asked ---------- */
{
  const NOW_RE = new Function(decl("NOW_RE") + " return NOW_RE;")();

  ["status", "status report", "sitrep", "brief me", "the rundown",
   "good morning", "morning", "how's my day looking", "run me through today",
   "bring me up to speed"]
    .forEach(q => t('"' + q + '" asks for a briefing', NOW_RE.brief.test(q), true));
  ["what is the weather", "tell me about the morning star", "status of my order"]
    .forEach(q => t('"' + q + '" does not', NOW_RE.brief.test(q), false));

  ["what's next", "next", "what is coming up", "my next meeting"]
    .forEach(q => t('"' + q + '" asks what is next', NOW_RE.next.test(q), true));
  t("but next week does not", NOW_RE.next.test("what is next week"), false);

  ["call yourself Jarvis", "your name is Jarvis", "from now on you're Friday",
   "you are called Edith"]
    .forEach(q => t('"' + q + '" renames him', NOW_RE.rename.test(q), true));
  t("and an ordinary sentence does not",
    NOW_RE.rename.test("your name is the least of my problems"), false);

  /* An event said the way a person says it, not the way a calendar stores it */
  const eventSaid = new Function(grab("eventSaid") + " return eventSaid;")();
  t("minutes away is said in minutes",
    eventSaid({ title:"Dentist", inMinutes:12 }), "Dentist in 12 minutes.");
  t("one minute is not one minutes",
    eventSaid({ title:"Call", inMinutes:1 }), "Call in 1 minute.");
  t("now is now", eventSaid({ title:"Standup", inMinutes:0 }), "Standup now.");
  t("hours away is said in hours",
    eventSaid({ title:"Flight", inMinutes:90 }).indexOf("1.5 hours") > -1, true);
  t("further off is given a time", eventSaid({ title:"Dinner", inMinutes:400 }).indexOf("at ") > -1, true);
  t("an all-day thing is just today", eventSaid({ title:"Leave", allDay:true }), "Leave today.");
  t("where it is comes too",
    eventSaid({ title:"Dentist", inMinutes:12, where:"Clinic" }), "Dentist in 12 minutes, at Clinic.");

  const saidCount = new Function(decl("SAID_NUMBERS") + grab("saidCount") + " return saidCount;")();
  t("small numbers are words, because he is saying them", saidCount(2), "two");
  t("and big ones are not", saidCount(23), "23");

  /* the briefing is assembled here, not asked of a model - it would cost a
     second and could get the time wrong */
  const brief = grab("briefNow");
  t("the briefing never goes near a model", brief.indexOf("askStream") === -1 &&
    brief.indexOf("stream(") === -1, true);
  t("it opens with the time of day", brief.indexOf("partOfDay()") > -1, true);
  t("the weather is in it", brief.indexOf("weather.now") > -1, true);
  t("so is what is coming up", brief.indexOf("diaryNext") > -1, true);
  t("a piece that cannot answer is left out rather than taking it down",
    brief.indexOf("function maybe") > -1 && brief.indexOf(".catch") > -1, true);
  t("the battery is only mentioned when it matters", brief.indexOf("b.low ?") > -1, true);
  t("a running timer is mentioned", brief.indexOf("timerLeft()") > -1, true);

  /* the useful half of a calendar he can read: not a list when you ask, a
     sentence when it matters */
  const watch = grab("watchDiary");
  t("he says something before an event starts", watch.indexOf("diaryNext") > -1, true);
  t("only once for each", watch.indexOf("diarySaid[mark]") > -1, true);
  t("never over the top of himself", watch.indexOf("hf.talking") > -1, true);
  t("it can be turned off entirely", watch.indexOf("if(early <= 0) return") > -1, true);
  t("and outside the app it says nothing at all", watch.indexOf(".catch(function(){})") > -1, true);
  t("what it remembers is thrown away after a day", watch.indexOf("24 * 3600 * 1000") > -1, true);
  t("it runs on a timer", has("watchDiary();") && has("setInterval(function(){"), true);
  t("and shares it with the battery, rather than each having one",
    src.indexOf("setInterval(watchDiary,") === -1, true);
  t("and not often - it is four minutes, not four seconds",
    new Function(decl("DIARY_CHECK") + " return DIARY_CHECK;")() >= 60000, true);

  /* Safari has never had the web battery API, so from the page this was
     unknowable and he always said so - on the phone he can just ask */
  const bat = grab("batteryNow");
  t("the battery is asked of the phone", bat.indexOf('nat("batteryLevel")') > -1, true);
  t("and the browser is only the fallback", bat.indexOf("navigator.getBattery") > -1, true);
  t("a low one is said as something to act on", bat.indexOf("You may want a charger") > -1, true);
}

/* ---------- what is working, and what is not ---------- */
{
  const NOW_RE = new Function(decl("NOW_RE") + " return NOW_RE;")();
  ["run diagnostics", "diagnostics", "systems check", "system check", "self test",
   "are you ok", "are you working", "all systems online", "what is wrong"]
    .forEach(q => t('"' + q + '" asks what is working', NOW_RE.check.test(q), true));
  t("but asking what is wrong with the car does not",
    NOW_RE.check.test("what is wrong with my car"), false);

  const diag = grab("runDiagnostics");
  t("it says which model is answering", diag.indexOf("providerLabel") > -1, true);
  /* noKeyYet() returns the sentence that explains there is no key - always a
     string, so asking it as a yes/no always answered yes */
  t("and whether there is a key at all", diag.indexOf("!apiKeyNow()") > -1, true);
  t("not by testing a function that returns a sentence",
    diag.indexOf("if(noKeyYet())") === -1, true);
  t("and whose voice he is using", diag.indexOf("elevenReady()") > -1, true);
  t("and whether the microphone is running", diag.indexOf("hf.rec") > -1, true);
  t("it finds out about the calendar by trying, not by guessing",
    diag.indexOf("diaryNext(24, 1)") > -1, true);
  t("a refusal there is one of the things reported, not a crash",
    diag.indexOf("I cannot read your calendar") > -1, true);
  t("what is wrong comes before what is fine",
    diag.indexOf("wrong.map(capFirst).join") > -1, true);
  t("and nothing at all wrong gets a short all-clear",
    diag.indexOf("All systems nominal") > -1, true);

  /* Each of these is a sentence of its own. It used to skip the capital when
     the manner was off, which said "three problems. no key for Gemini". */
  const cap = new Function(grab("capFirst") + " return capFirst;")();
  t("a sentence gets a capital", cap("no key for Gemini"), "No key for Gemini");
  t("whatever the manner is", grab("capFirst").indexOf("manner") === -1, true);
  t("and the diagnostics use it on every one", diag.indexOf("wrong.map(capFirst)") > -1, true);

  /* a phone that dies mid-sentence, said once on the way down */
  const bat = grab("watchBattery");
  t("he says when the battery is going", bat.indexOf("Battery is down to") > -1, true);
  t("twice at most - twenty, then ten", bat.indexOf("b.percent <= 10 ? 10") > -1, true);
  t("not again at the same level", bat.indexOf("batterySaid === step") > -1, true);
  t("charging starts it over", bat.indexOf("batterySaid = 0") > -1, true);
  t("and never over the top of him", bat.indexOf("hf.talking") > -1, true);
  t("it rides the diary timer rather than starting one of its own",
    has("watchBattery();") && src.indexOf("setInterval(watchBattery") === -1, true);
}

/* ---------- the phone's side of it ---------- */
{
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");
  ["calendarNext", "batteryLevel"].forEach(m => {
    t(m + " is offered to the app", sw.indexOf('CAPPluginMethod(name: "' + m + '"') > -1, true);
    t(m + " is written", sw.indexOf("@objc func " + m + "(") > -1, true);
  });
  t("reading the calendar asks for the permission that allows reading",
    sw.indexOf("requestFullAccessToEvents") > -1, true);
  t("and writing still asks only for the smaller one",
    sw.indexOf("requestWriteOnlyAccessToEvents") > -1, true);
  t("only the next few come back", sw.indexOf('call.getInt("limit") ?? 3') > -1, true);
  t("and only from the near future", sw.indexOf('call.getInt("hours") ?? 24') > -1, true);
  t("a week is as far as it will look", sw.indexOf("min(168") > -1, true);
  t("battery monitoring is put back as it was found",
    sw.indexOf("if !wasOn { device.isBatteryMonitoringEnabled = false }") > -1, true);
  t("a simulator, which has no battery, is not reported as empty",
    sw.indexOf("guard level >= 0") > -1, true);

  const wf = fs.readFileSync(".github/workflows/build-ios.yml", "utf8");
  t("full calendar access is declared, or the phone ends the app the moment he asks",
    wf.indexOf("NSCalendarsFullAccessUsageDescription") > -1, true);
  t("and it is checked after the build",
    wf.indexOf("NSCalendarsUsageDescription NSCalendarsFullAccessUsageDescription") > -1, true);
}

/* ---------- somewhere to change any of it ---------- */
{
  t("there is a voice to choose", has('id="setElevenVoice"'), true);
  t("filled from the account", has("function fillElevenVoices"), true);
  t("with no key it says so rather than sitting empty",
    grab("fillElevenVoices").indexOf("Add a key above first") > -1, true);
  t("and a failure says why",
    grab("fillElevenVoices").indexOf("Could not read your voices") > -1, true);
  t("choosing one is heard straight away",
    src.indexOf('$("setElevenVoice").addEventListener') > -1 &&
    src.indexOf("This is how I sound.") > -1, true);
  t("the manner can be turned off", has('id="swManner"'), true);
  t("which changes the voice as well as the words",
    src.indexOf("store.settings.mood = on ? \"normal\" : \"composed\"") > -1, true);
  t("how early he warns you can be changed", has('id="setHeadsUp"'), true);
  t("including never", has('<option value="0">Never</option>'), true);
  t("a new key means a new list, not the old account's voices",
    src.indexOf("a different key is a different account") > -1, true);
}

console.log(fail ? NL + fail + " FAILURES" : NL + "All " + pass + " JARVIS tests passed");
process.exit(fail ? 1 : 0);
