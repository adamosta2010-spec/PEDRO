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
const TOOLSRC = decl("TOOLS");

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
  t("but rarely", m.indexOf("say sir rarely") > -1, true);
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
  /* Adam gave the id and asked for it to be the voice. It is from his own
     account, so it resolves - which was the whole objection to writing one in.
     Anyone else still gets one chosen from theirs. */
  /* the id given to me was a custom voice, not one of the twenty-one premade
     ones - so it could only ever work inside the library it came from */
  t("it starts with a voice anyone can use",
    has('elevenVoice:"onwK4e9ZLuTAKqWW03F9"'), true);
  t("only once", grab("elevenList").indexOf("if(elevenListed) return elevenListed") > -1, true);
  t("but a bad signal is not remembered forever",
    grab("elevenList").indexOf("elevenListed = null") > -1, true);
  /* A voice that could not be chosen fell back to the phone on every sentence
     and never said why, which looks exactly like nothing having changed. */
  t("a failure to choose keeps its reason",
    grab("elevenChooseVoice").indexOf("elevenWhy =") > -1, true);
  t("an empty account is a reason too",
    grab("elevenChooseVoice").indexOf("has no voices in it") > -1, true);
  t("and it is said at start, not left silent",
    has("Could not choose a voice."), true);
  t("diagnostics reports it as a problem",
    grab("runDiagnostics").indexOf("I could not read your voices") > -1, true);
  t("as is having a key but no voice picked",
    grab("runDiagnostics").indexOf("no voice chosen yet") > -1, true);
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
  t("outside the app it stops asking rather than asking forever",
    watch.indexOf("diaryRefused = true") > -1, true);
  t("and it does not ask again once refused",
    watch.indexOf("if(diaryRefused) return;") > -1, true);
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
  /* listing needs no key at all - twenty-one premade voices come back - so
     refusing to fetch until there was one left the dropdown empty for nothing */
  t("with no key it still fills, because listing needs none",
    grab("fillElevenVoices").indexOf("Add a key above first") > -1, false);
  t("and says a key is still needed to speak",
    grab("fillElevenVoices").indexOf("needs a key above before he can speak") > -1, true);
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


/* ---------- the things Adam found on the phone ---------- */
{
  /* 1. The new words did nothing. rightNow answers through sayNow, which hands
        the microphone back itself, and then hfAsk handed it back again. For
        "status", which fetches the weather first, the second hand-back ran
        BEFORE the answer existed: the microphone reopened, the screen said
        Listening, and then he started talking into it. */
  t("an answer can say it has handed the microphone back", has("var handedBack"), true);
  t("and it is declared only once",
    (src.match(/var handedBack/g) || []).length, 1);
  t("rightNow says so the moment it takes the question, not when it answers",
    grab("theSmallThings").indexOf("handedBack = true; return true;") > -1, true);
  t("which is what makes it right for an answer that has to fetch something",
    grab("theSmallThings").indexOf("have to fetch something first") > -1, true);
  t("and hfAsk does not hand it back a second time",
    grab("hfAsk").indexOf("if(!handedBack) carryOn();") > -1, true);
  t("the same for opening something",
    (grab("hfAsk").match(/if\(!handedBack\) carryOn\(\);/g) || []).length, 2);
  /* the coin, the dice and the timer speak directly and still need it */
  t("but a coin flip still gets its hand-back",
    grab("theSmallThings").indexOf("speak('It is ' + side") > -1, true);

  /* 2. Saying his name did nothing once he was already listening. */
  const heard = grab("hfHeardText");
  t("his name is heard while idle and while listening",
    heard.indexOf('hf.phase === "wait" || hf.phase === "hear"') > -1, true);
  t("and anything else said while listening carries on as a question",
    heard.indexOf('if(hf.phase === "wait") return;') > -1, true);
  const answers = new Function(decl("ANSWER_TO_NAME") + " return ANSWER_TO_NAME;")();
  t("he has something to answer with", answers.length > 1, true);
  /* all four used to contain sir, which is what made it a tic */
  t("and only some of them say sir",
    answers.filter(a => /sir/i.test(a)).length < answers.length / 2, true);
  t("with the manner off he is plainer about it", heard.indexOf('"Yeah?"') > -1, true);
  t("a name with a question after it is not answered, it is acted on",
    heard.indexOf("hfSettle(after)") > -1, true);

  /* 3 and 4. The ball is fixed: dead centre, one size, does not move. */
  const page = fs.readFileSync("index.html", "utf8");
  t("the middle is placed, not laid out",
    page.indexOf(".hudcentre{position:absolute;left:50%;top:50%;") > -1, true);
  t("so an open panel does not shove it sideways",
    /\.hudcentre\{[^}]*translate\(-50%,-50%\)/.test(page), true);
  t("the words hang below the ball rather than being stacked with it",
    /#hfWords\{[^}]*position:absolute/.test(page), true);
  t("which is what stopped the ball sitting above centre",
    page.indexOf("pushed the ball up by half their own height") > -1, true);
  t("a second finger does nothing", grab("handsOn").indexOf("if(grip.count >= 2) return;") > -1, true);
  t("nothing writes a scale onto it", grab("gripApply").indexOf("scale(") > -1, false);
  t("and a size saved by an older build is thrown away",
    grab("gripLoad").indexOf("delete g.size; delete g.scale;") > -1, true);
}

/* ---------- where he is, and the weather ---------- */
{
  /* It has been wrong twice. getCurrentPosition cannot succeed on iOS without
     a usage string in the Info.plist, and there was none - so it failed every
     time, the tool errored, and the model invented a temperature. */
  const wf = fs.readFileSync(".github/workflows/build-ios.yml", "utf8");
  t("location is declared, or it can never succeed",
    wf.indexOf("NSLocationWhenInUseUsageDescription") > -1, true);
  t("and it is checked after the build",
    wf.indexOf("NSContactsUsageDescription NSLocationWhenInUseUsageDescription") > -1, true);

  /* and it no longer depends on that permission at all */
  const clock = new Function(grab("placeFromClock") + " return placeFromClock;")();
  t("the phone's time zone names the city", typeof clock(), "string");
  t("which needs no permission and no waiting",
    grab("placeFromClock").indexOf("resolvedOptions().timeZone") > -1, true);
  t("a three-part zone still gives the city",
    grab("placeFromClock").indexOf("bits[bits.length - 1]") > -1, true);
  t("and an underscore is not read out as one",
    grab("placeFromClock").indexOf('split("_").join(" ")') > -1, true);

  const me = grab("whereAmI");
  t("the clock is tried before the permission is", me.indexOf("byClock") > -1, true);
  t("where he is, is remembered", me.indexOf("store.settings.home") > -1, true);
  t("and not looked up again for a day", me.indexOf("24 * 3600 * 1000") > -1, true);
  t("somewhere he typed in himself always wins", me.indexOf("kept.byHand") > -1, true);
  t("and a stale answer beats no answer",
    me.indexOf("stale is better than nothing") > -1, true);
  t("he says the country, not just the city",
    grab("weatherAt").indexOf("spot.country") > -1, true);
  t("there is somewhere to set it by hand", has('id="setHome"'), true);
  t("and clearing it goes back to the clock",
    src.indexOf("Back to the phone's time zone.") > -1, true);
}

/* ---------- a voice id that stays put ---------- */
{
  t("there is a box to paste one into", has('id="setVoiceId"'), true);
  t("and it is a default he can change, not one set by hand", has("voiceByHand:false"), true);
  t("choosing from the list leaves it alone",
    grab("elevenChooseVoice").indexOf("store.settings.voiceByHand && store.settings.elevenVoice") > -1, true);
  t("a new key does not clear it",
    src.indexOf("if(!store.settings.voiceByHand) store.settings.elevenVoice = \"\";") > -1, true);
  t("and neither does starting the app",
    src.indexOf('elevenVoice === "IKne3meq5aSn9XLyUdCD" && !store.settings.voiceByHand') > -1, true);
  t("clearing the box goes back to choosing",
    src.indexOf("Back to choosing from your account.") > -1, true);
  t("it carries to a new install", has("voiceByHand:s.voiceByHand"), true);
}

/* ---------- what he remembers ---------- */
{
  const MOST = new Function(decl("MEMORY_MOST") + " return MEMORY_MOST;")();
  t("there is a ceiling", MOST > 0, true);
  const add = grab("addMemory");
  /* It used to drop whatever was oldest, which is backwards: the things worth
     keeping are the ones he keeps needing, and those are the oldest of all. */
  t("the least useful is dropped, not the oldest", add.indexOf("never used goes first") > -1, true);
  t("and age only breaks the tie", add.indexOf("then oldest") > -1, true);
  t("a new memory starts having been used nothing", add.indexOf("used: 0") > -1, true);
  const recall = grab("recallFor");
  t("being wanted is what earns its place", recall.indexOf("x.ref.used = (x.ref.used || 0) + 1") > -1, true);
  t("but only when it was actually relevant", recall.indexOf("if(x.score > 0)") > -1, true);
  t("and counting it does not write to storage on every question",
    recall.indexOf("save()") === -1, true);
}


/* ---------- the app restarting by itself ---------- */
{
  /* An app that restarts leaves nothing behind to look at, so it writes down
     every start and every error. Guessing at the cause was the alternative. */
  t("every start is written down", has("function noteStart"), true);
  t("and every error", has('window.addEventListener("error"'), true);
  t("including the ones inside a promise", has('"unhandledrejection"'), true);
  t("the list is capped", grab("noteStart").indexOf("TROUBLE_KEEP") > -1, true);
  t("the same error forty times is one error",
    grab("noteTrouble").indexOf("last.n = (last.n || 1) + 1") > -1, true);
  const diag = grab("runDiagnostics");
  t("too many restarts is reported as a problem",
    diag.indexOf("times in the last hour") > -1, true);
  t("and so is the last thing that went wrong",
    diag.indexOf("last thing to go wrong") > -1, true);
  t("but only if it was recent", diag.indexOf("ago < 120") > -1, true);
  t("writing it down changes nothing else",
    has("it only writes down what did"), true);
}


/* The camera is gone. What used to be tested here - the shutter, the
   listen button, the corner brackets - went with it. */
{
  t("nothing opens a lens", src.indexOf("function camOpen") > -1, false);
  t("no camera in the page", fs.readFileSync("index.html", "utf8").indexOf('id="cam"') > -1, false);
  t("and no tool reaches for one", src.indexOf('"camera.look"') > -1, false);
}


/* ---------- the camera when there is no key, or a bad one ---------- */
{
  /* "It says the API key does not work, but I do not use an API key."
     visionProvider reaches for any key it can find whatever provider is
     chosen, so a stale one takes over the camera - and then a failed request
     just printed the failure, with the phone's own eyes sitting unused. */
  t("a refused key is not reached for again", has("var visionRefused"), true);
  t("and visionProvider skips it",
    grab("visionProvider").indexOf("!visionRefused[mine]") > -1, true);
  /* the camera used those, and it is gone - but a refused key still matters,
     because building a hologram from a web photograph goes the same way */
  t("nothing asks a lens any more", src.indexOf("function camAsk") > -1, false);

  /* the voice he asked for by id */
  /* the id given to me was a custom voice, not one of the twenty-one premade
     ones - so it could only ever work inside the library it came from */
  t("it starts with a voice anyone can use",
    has('elevenVoice:"onwK4e9ZLuTAKqWW03F9"'), true);
  t("a phone already running gets it once", has("store.settings.voiceMoved"), true);
  t("and a phone carrying the custom one is moved across",
    src.indexOf("voiceKept") > -1, true);
  /* a voice and no key looks set up and does nothing, which is the worst state */
  t("a voice with no key is called out",
    grab("runDiagnostics").indexOf("no ElevenLabs key") > -1, true);
  t("and said in Settings too", has('id="voiceNeedsKey"'), true);
}

/* ---------- the answers show what they found ---------- */
{
  const page = fs.readFileSync("index.html", "utf8");
  const inPage = s => page.indexOf(s) > -1;

  /* Asking the time and only hearing it wastes a screen. */
  t("there is a card for what he found", inPage('data-panel="answer"'), true);
  t("it is one of the panels, so it is themed with everything else",
    inPage('<div class="hudpanel" data-panel="answer">'), true);
  t("filled in from one place", has("function showCard"), true);
  t("with the values put in as text, never as markup",
    grab("showCard").indexOf("innerHTML") === grab("showCard").lastIndexOf("innerHTML"), true);
  t("and an empty row is left out rather than drawn blank",
    grab("showCard").indexOf("if(!r || (!r.label && !r.value)) return;") > -1, true);

  const rn = grab("rightNow");
  ["Time", "Date", "Battery", "Coming up"].forEach(k =>
    t('"' + k + '" gets a card', rn.indexOf('showCard("' + k + '"') > -1, true));
  t("the weather gets its own, with the numbers laid out",
    has("function weatherCard"), true);
  t("wind and humidity too, which the spoken answer leaves out",
    grab("weatherCard").indexOf("relative_humidity_2m") > -1, true);
  t("and the briefing shows the diary rather than only saying the first",
    grab("briefNow").indexOf("diaryNext(24, 4)") > -1, true);

  /* moved and resized */
  t("every panel gets a corner to resize by",
    grab("showHudPanel").indexOf('grip.className = "hgrip"') > -1, true);
  t("added once, not on every open",
    grab("showHudPanel").indexOf('if(!panel.querySelector(".hgrip"))') > -1, true);
  t("the corner is read before the panel, or it would just move",
    grab("handsOn").indexOf('ev.target.closest(".hgrip")') > -1, true);
  t("resizing does not move it", grab("handsOn").indexOf("wasSize.w + (ev.clientX - at.x)") > -1, true);
  t("it cannot be shrunk to nothing", grab("handsOn").indexOf("Math.max(150") > -1, true);
  t("nor grown past the screen", grab("handsOn").indexOf("window.innerWidth - 20") > -1, true);
  t("the size is remembered", has("function panelSize"), true);
  t("and given back next time", grab("showHudPanel").indexOf("panel.style.width = was.w") > -1, true);
  t("and carried to a new install", has("panelSizes:s.panelSizes"), true);

  /* it could only ever be done inside the app, which is not where it gets tested */
  t("picking things up is set up when the voice screen opens",
    grab("hfOpen").indexOf("handsOn();") > -1, true);
  t("and only once, or there would be two of every listener",
    grab("handsOn").indexOf("if(handsAreOn) return;") > -1, true);

  /* and the words under the ball stop competing with it */
  t("the words under the ball are smaller", inPage("#hfState{font-size:10.5px"), true);
  t("and so is what he heard you say", inPage("#hfHeard{color:var(--tx);font-size:14.5px"), true);
}


/* ---------- being cut off, and being remembered ---------- */
{
  /* iOS calls a stretch of speech final on quite a short breath, so acting on
     one straight away answered the first half of a sentence - and several
     finals for one sentence each started their own question. */
  const heard = grab("hfHeardText");
  t("a final is gathered rather than acted on",
    heard.indexOf('hf.said = (hf.said ? hf.said + " " : "") + finalTxt.trim()') > -1, true);
  t("so it never asks straight off a final", heard.indexOf("hfAsk(finalTxt.trim())") > -1, false);
  t("and what is being said now is added to it",
    heard.indexOf('var sofar = (hf.said ? hf.said + " " : "") + live') > -1, true);
  t("what was gathered is cleared when the question goes",
    grab("hfAsk").indexOf('hf.said = "";') > -1, true);
  t("and when the microphone comes back",
    grab("carryOn").indexOf('hf.said = "";') > -1, true);

  const PATIENCE = new Function(decl("PATIENCE") + " return PATIENCE;")();
  t("how long a silence has to be is a setting", !!PATIENCE.normal, true);
  t("quick is quicker than normal", PATIENCE.quick.mid < PATIENCE.normal.mid, true);
  t("and patient is longer", PATIENCE.patient.mid > PATIENCE.normal.mid, true);
  t("even quick leaves longer than it used to", PATIENCE.quick.mid > 620, true);

  const settleFor = new Function("store", "HF_SHORT_ASK", "HF_HANGING",
    decl("PATIENCE") + grab("patienceNow") + grab("stillGoing") + grab("settleFor") +
    " return settleFor;")({ settings:{ patience:"normal" } },
      /^(?:why|how|what)\b/i, ["and", "but", "because", "so"]);
  t("a sentence ending on 'and' gets the longest wait",
    settleFor("tell me about dogs and"), PATIENCE.normal.max);
  t("two words gets the longest wait too - it is usually the start of something",
    settleFor("text mum"), PATIENCE.normal.max);
  t("but a short follow-up is answered sooner",
    settleFor("why?") < PATIENCE.normal.max, true);
  t("a question that has clearly landed is answered soonest",
    settleFor("what is the capital of France?"), PATIENCE.normal.min);
  t("and nothing at all waits the longest", settleFor(""), PATIENCE.normal.max);

  /* Nothing said out loud was ever remembered: rememberFrom was only called
     from send(), the typed path. */
  t("what he says out loud is remembered too",
    grab("hfAsk").indexOf("rememberFrom(question)") > -1, true);
  t("before the question goes, so it is there this turn and not the next",
    grab("hfAsk").indexOf("rememberFrom(question)") <
    grab("hfAsk").indexOf('c.messages.push({ role:"user", content:question'), true);

  const RULES = new Function(decl("MEMORY_RULES") + " return MEMORY_RULES;")();
  const rf = new Function("MEMORY_RULES", "REMEMBER_RE", "FORGET_RE", "addMemory", "forgetMemory",
    grab("rememberFrom") + " return rememberFrom;");
  const got = [];
  const run = rf(RULES, /^remember (?:that )?(.+)/i, /^forget (.+)/i,
    x => { got.push(x); return true; }, () => 0);
  const said = s => { got.length = 0; run(s); return got.slice(); };
  /* ten narrow patterns missed the way most facts about a life are said */
  t("my sister's birthday is remembered",
    said("my sister's birthday is on the 3rd of June")[0],
    "Their sister's birthday is on the 3rd of June.");
  t("so is my dog's name", said("my dog is called Rex").length > 0, true);
  t("and a fact about somebody named",
    said("Marcus's favourite food is sushi")[0], "Marcus's favourite food is sushi.");
  t("an allergy is worth keeping", said("I am allergic to peanuts").length > 0, true);
  t("but a question is not a statement", said("what is the capital of France?").length, 0);
  t("nor is an instruction", said("play some music").length, 0);

  /* no list of patterns is ever complete, so the model is asked too */
  t("the model is asked as well", has("function rememberHarder"), true);
  t("only when the patterns found nothing",
    grab("hfAsk").indexOf("else setTimeout(function(){ rememberHarder(question); }") > -1, true);
  t("and after he has finished speaking, so nothing waits on it",
    grab("hfAsk").indexOf("}, 2500);") > -1, true);
  const worth = new Function("MEM_SKIP", decl("MEM_SKIP") + grab("worthAsking") + " return worthAsking;")();
  t("a question is never sent to it", worth("what is the capital of france?"), false);
  t("nor an instruction", worth("play some music for me now"), false);
  t("nor something with nothing personal in it", worth("the sky is blue today"), false);
  t("but something about them is", worth("my sister just moved to Berlin"), true);
}


/* ---------- the background problem ---------- */
{
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");
  /* Background audio was declared, so the app was allowed to keep running. What
     was missing is everything that happens TO an audio session on a phone
     somebody is using - and with the session gone inactive, background audio
     stops keeping the app alive: iOS suspends it, then kills it, and the next
     open reloads the page. That is the refreshing. */
  t("a phone call taking the microphone is noticed",
    sw.indexOf("AVAudioSession.interruptionNotification") > -1, true);
  t("and he comes back when it ends", sw.indexOf("shouldResume") > -1, true);
  t("the audio daemon restarting is noticed",
    sw.indexOf("mediaServicesWereResetNotification") > -1, true);
  t("and headphones changing the input format",
    sw.indexOf("AVAudioEngineConfigurationChange") > -1, true);
  t("it is all rebuilt rather than resumed - the old objects are dead",
    sw.indexOf("recognizer = nil            // a recogniser from before a reset") > -1, true);
  t("several notifications for one event cause one rebuild",
    sw.indexOf("guard !comingBack else { return }") > -1, true);
  t("and nothing is rebuilt if listening was not wanted",
    sw.indexOf("guard wantListening else { return }") > -1, true);
  t("the notifications are only subscribed to once",
    sw.indexOf("guard !watchingAudio else { return }") > -1, true);

  /* restartListening already existed, for when Apple ends a task after about a
     minute. It never asked for the audio session back - so after one phone
     call, starting the engine could only fail. */
  const restart = sw.slice(sw.indexOf("private func restartListening"));
  t("restarting asks for the session back first",
    restart.indexOf("session.setActive(true") > -1 &&
    restart.indexOf("session.setActive(true") < restart.indexOf("try engine.start()"), true);

  /* and the page is told, so it stops being a mystery */
  t("the phone says what happened to the microphone",
    sw.indexOf('notifyListeners("pedroAudio"') > -1, true);
  t("the page listens for it", has('natListen("pedroAudio"'), true);
  t("and writes it down", src.indexOf('noteTrouble("microphone: " + what)') > -1, true);
  t("diagnostics reports a microphone that keeps being taken",
    grab("runDiagnostics").indexOf("taken from me") > -1, true);
  t("but only recently", grab("troubleLike").indexOf("2 * 3600 * 1000") > -1, true);

  /* what he asked for: answer in the background, then stand down */
  const on = grab("carryOn");
  t("off screen he answers and then stands down",
    on.indexOf('document.visibilityState === "hidden"') > -1, true);
  t("back to needing his name", on.indexOf("hfSet(\"wait\", hfIdleLabel());") > -1, true);
  t("rather than holding a conversation open behind other apps",
    on.indexOf("hf.turns = 0;") > -1, true);
  t("and with a fresh microphone, so nothing said over him carries over",
    on.indexOf("hfFreshMic();              /* nothing heard over him") > -1, true);
}


/* ---------- clapping, the web, and holograms ---------- */
{
  const page = fs.readFileSync("index.html", "utf8");
  const inPage = s => page.indexOf(s) > -1;
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");

  /* ---- clapping ---- */
  t("the phone listens for claps", sw.indexOf("private func hearClap") > -1, true);
  t("on the buffers the recogniser already gets",
    sw.indexOf("self?.hearClap(buffer)") > -1, true);
  t("in both places the tap is installed",
    (sw.match(/self\?\.hearClap\(buffer\)/g) || []).length, 2);
  t("a clap is loud against the room, not against a fixed number",
    sw.indexOf("peak > roomLevel * 9") > -1, true);
  t("and sharp - which is what a shout is not",
    sw.indexOf("peak / rms > 4.5") > -1, true);
  t("the room level cannot be dragged up by the clap itself",
    sw.indexOf("roomLevel * 0.97") > -1, true);
  t("one clap is not counted twice as it rings out",
    sw.indexOf("now - lastClapAt > 0.12") > -1, true);
  t("claps more than a moment apart are different events",
    sw.indexOf("now - $0 < 0.75") > -1, true);
  t("it is off unless asked for", sw.indexOf("private var clapsWanted = 0") > -1, true);
  t("the page can turn it on", sw.indexOf("@objc func setClap") > -1, true);
  t("two is what it starts at - one sharp sound is a door",
    has("claps:2,"), true);
  t("the page hears the clap", has('natListen("pedroClap"'), true);
  t("and it ends where using his name ends", has("function hfWokenByClap"), true);
  t("it is turned on again with the microphone",
    grab("nativeMicStart").indexOf("applyClaps()") > -1, true);
  t("there is somewhere to change it", inPage('id="setClaps"'), true);

  /* ---- the web ---- */
  /* web.search only ever opened Safari and said it had "opened a search" - he
     never saw a word of it, so he could not compare or check anything. */
  t("he reads the web rather than opening a tab at it",
    grab("webLook").indexOf("wikiFind") > -1, true);
  t("and web.search uses it", TOOLSRC.indexOf("return webLook(q, 2)") > -1, true);
  t("it no longer just opens a tab and looks away",
    TOOLSRC.indexOf('opened a search for " + q') > -1, false);
  t("Wikipedia is asked properly, with CORS", has("format=json&origin=*"), true);
  t("and read a summary at a time", has("api/rest_v1/page/summary/"), true);
  t("DuckDuckGo covers what Wikipedia does not", has("api.duckduckgo.com"), true);
  t("and a page can be read as plain text", has("r.jina.ai"), true);
  t("none of it needs a key", grab("wikiRead").indexOf("apiKeyNow") === -1, true);
  t("comparing several things is its own tool", TOOLSRC.indexOf('"web.compare"') > -1, true);
  t("which splits them on vs, and, or a comma",
    TOOLSRC.indexOf("versus|and|or") > -1, true);
  t("and stops at four, because a spoken answer cannot hold more",
    TOOLSRC.indexOf(".slice(0, 4)") > -1, true);
  t("a page that will not open says so rather than hanging",
    grab("pageRead").indexOf("that page would not open") > -1, true);
  t("and what comes back is capped", grab("pageRead").indexOf("most || 6000") > -1, true);

  /* ---- holograms ---- */
  /* not a generated picture - a real photograph, treated until it reads as
     light. He is a voice assistant; making pictures went. */
  t("there is somewhere to put one", inPage('id="holo"'), true);
  t("a photograph of it is a real one, found on the web",
    grab("holoPhoto").indexOf("webLook(what, 3)") > -1, true);
  t("and one with a picture is the one used",
    grab("holoPhoto").indexOf("f.image") > -1, true);
  t("nothing is generated", has("function drawPicture"), false);
  t("it is turned to light rather than shown as a photo",
    inPage("hue-rotate(150deg)") && inPage("drop-shadow(0 0 14px"), true);
  t("with lines across it", inPage("#holo .lines{"), true);
  t("and something sweeping down it", inPage("@keyframes holoSweep"), true);
  t("it floats", inPage("@keyframes holoFloat"), true);
  t("everything that moves is a transform, as everywhere else",
    /@keyframes holoFloat\{[^@]*transform:/.test(page), true);
  t("the ball gets out of the way", inPage("#hfOrb.holo .disc{display:none}"), true);
  t("no picture found is said, not left blank",
    grab("holoPhoto").indexOf("I could not find a picture of") > -1, true);
  t("a picture that will not load is said too",
    grab("holoPhoto").indexOf("the picture would not load") > -1, true);
  t("tapping it puts it away", grab("holoHide").indexOf("classList.remove(\"holo\")") > -1, true);

  const holoOf = new Function("HOLO_NOT", "HOLO_RE",
    decl("HOLO_NOT") + decl("HOLO_RE") + grab("holoOf") + " return holoOf;")();
  [["show me a picture of the Eiffel Tower", "Eiffel Tower"],
   ["show me an image of a lion", "lion"],
   ["what does a pangolin look like", "pangolin"],
   ["show me a hologram of Saturn", "Saturn"],
   ["hologram of the moon", "moon"],
   ["show me the Colosseum", "Colosseum"]]
    .forEach(([q, want]) => t('"' + q + '" asks for one', holoOf(q), want));
  /* "show me X" is greedy, so the things that are his own are kept out by name */
  ["show me my calendar", "show me the weather", "show me the time",
   "show me settings", "show me the transcript", "what is the capital of france"]
    .forEach(q => t('"' + q + '" does not', holoOf(q), null));
}


/* ---------- looking it up, and party mode ---------- */
{
  const page = fs.readFileSync("index.html", "utf8");
  const inPage = s => page.indexOf(s) > -1;

  /* He can read the web, but only when he reaches for the tool - and a model
     that does not know something says so rather than going to look. */
  const unsure = new Function("DUNNO", decl("DUNNO") + grab("soundsUnsure") + " return soundsUnsure;")();
  ["I don't know.", "I'm not sure who that is.",
   "I can't browse the internet, so I don't have current information.",
   "As of my last knowledge update I do not have that.",
   "I have no way of knowing that.", "I am unable to check that."]
    .forEach(a => t('"' + a.slice(0, 30) + '" is an admission', unsure(a), true));
  t("but an answer is not", unsure("Paris."), false);
  /* a long answer that happens to contain "I am not sure" is still an answer,
     and throwing it away to re-ask would lose something useful */
  t("nor is a long answer that hedges in the middle",
    unsure("The tower was finished in 1889. " + "x".repeat(430) + " I am not sure about the paint."), false);

  const ask = grab("hfAsk");
  t("an admission sends him to the web", ask.indexOf("soundsUnsure(answer)") > -1, true);
  t("once, never twice", ask.indexOf("var lookedUp = false;") > -1 &&
    ask.indexOf("lookedUp = true;") > -1, true);
  t("and not at all without something to ask", ask.indexOf("apiKeyNow() && !isDevice()") > -1, true);
  const look = grab("lookItUp");
  t("it reads the web first", look.indexOf("webLook(question, 3)") > -1, true);
  t("then answers from what came back", look.indexOf("What the web says") > -1, true);
  t("in speech, because it is being said", look.indexOf("voiceMode = true") > -1, true);
  t("and if the web has nothing, his own answer stands",
    ask.indexOf("the web had nothing either") > -1, true);

  /* ---- party mode ---- */
  const on = new Function(decl("PARTY_ON_RE") + " return PARTY_ON_RE;")();
  const off = new Function(decl("PARTY_OFF_RE") + " return PARTY_OFF_RE;")();
  ["party", "party time", "party mode", "let's party", "start the party"]
    .forEach(q => t('"' + q + '" starts it', on.test(q), true));
  ["party's over", "stop the party", "party off", "calm down"]
    .forEach(q => t('"' + q + '" ends it', off.test(q), true));
  t("but talking about a party does not start one",
    on.test("a party for my birthday"), false);
  t("nor does asking about one", on.test("when is the party"), false);

  t("the circle runs through colour", inPage("@keyframes partyHue"), true);
  t("and quickens", inPage("#hfOrb.party .disc{"), true);
  t("the words go with it", inPage("#hf.party #hfState{"), true);
  t("and there is a wash behind it all", inPage("#hf.party::after{"), true);
  /* They are over the top of everything now, where a beam has to read as
     light falling on the room rather than paint over it - so screen is on
     purpose. Four elements, only while a party is on. Nothing is blurred. */
  t("the beams fall as light rather than paint",
    /#partyLights i{[^}]*mix-blend-mode:screen/.test(page), true);
  t("but nothing is blurred", /#partyLights i{[^}]*filter:s*blur/.test(page), false);
  t("and they are over everything, not under it",
    /#partyLights{[^}]*z-index:8/.test(page), true);
  t("without taking any taps", /#partyLights{[^}]*pointer-events:none/.test(page), true);
  t("the voice goes with it", grab("partySet").indexOf('"excited"') > -1, true);
  t("and comes back afterwards", grab("partySet").indexOf('"composed"') > -1, true);
  t("it is remembered", grab("partySet").indexOf("store.settings.party") > -1, true);
  t("and still on when he opens it again",
    grab("hfOpen").indexOf("if(store.settings.party) partySet(true)") > -1, true);
  t("and carried to a new install", has("party:s.party"), true);
}


/* ---------- the hologram is a 3D thing you can handle ---------- */
{
  const page = fs.readFileSync("index.html", "utf8");
  const inPage = s => page.indexOf(s) > -1;
  /* the renderer is kept as a string, so read it out and check the real code */
  const code = new Function(decl("VIZ3D_RENDER") + " return VIZ3D_RENDER;")();
  t("the renderer parses on its own", (() => { try { new Function(code); return true; }
    catch(e){ return false; } })(), true);

  t("one finger turns it on both axes",
    code.indexOf("view.ry += (e.clientX - touch.x)") > -1 &&
    code.indexOf("view.rx += (e.clientY - touch.y)") > -1, true);
  t("and cannot be turned upside down", code.indexOf("Math.max(-1.4, Math.min(1.4, view.rx))") > -1, true);
  /* Moving and pinching came out: they were what dragged a getBoundingClientRect
     into frame(), forcing a layout sixty times a second for a number that only
     changes when the window does. That was the lag he was feeling. */
  t("nothing moves it about any more", code.indexOf("view.px = pinch.px") > -1, false);
  t("nor pinches it", code.indexOf("pinch.zoom") > -1, false);
  t("and the pixel ratio is worked out once, where the size changes",
    code.indexOf("SCALE = dpr;") > -1, true);
  t("not inside the draw loop",
    code.slice(code.indexOf("function frame()")).indexOf("getBoundingClientRect") === -1, true);
  t("and one finger is all it listens for", code.indexOf("fingers[e.pointerId]") > -1, false);

  /* it fills the screen behind the words rather than sitting in a porthole */
  t("there is a background mode", inPage("#hf.bg #hfOrb#hfOrb{position:fixed"), true);
  t("which fills the screen", inPage("width:100vw;height:100vh"), true);
  t("with no corners, since it is not in a porthole any more",
    inPage("border-radius:0;border:0;opacity:1"), true);
  /* #hfOrb.showing #orbViz is declared later with the same weight and would win */
  t("and it outranks the porthole rules rather than merely following them",
    inPage("#orbViz#orbViz{"), true);
  t("the words sit over it", inPage("#hf.bg #hfWords#hfWords{"), true);
  t("and stay readable against whatever it is showing",
    /#hf\.bg #hfWords#hfWords\{[^}]*text-shadow/.test(page), true);

  /* Asked from memory the model produces whatever it imagines and the
     proportions are nobody's, which is what made the old ones look like a
     pile of boxes. It is built from a photograph of the actual thing now. */
  t("asking for a hologram builds one from a photograph",
    grab("holoShow").indexOf("spec3dFromPhoto(what)") > -1, true);
  t("and falls back to the ones it already knows",
    grab("holoShow").indexOf("spec3dKnownAll(what)") > -1, true);
  t("and to a real photograph when it cannot build anything",
    grab("holoShow").indexOf("holoPhoto(what)") > -1, true);
  t("in the background", grab("holoShow").indexOf('classList.add("bg")') > -1, true);
  t("and leaving it puts the screen back", grab("holoHide").indexOf('classList.remove("bg")') > -1, true);
  /* a photograph is still the right answer for the things a model made of
     boxes and cylinders cannot be */
  t("a real photograph is still there for what a model cannot be",
    has("function holoPhoto"), true);
}


/* ---------- the hologram, rebuilt ---------- */
{
  const page = fs.readFileSync("index.html", "utf8");
  const inPage = s => page.indexOf(s) > -1;
  const code = new Function(decl("VIZ3D_RENDER") + " return VIZ3D_RENDER;")();

  /* "It is in some kind of box." The wrapper sized every canvas to 100vmin -
     a square the size of the shorter side, which on a tall phone is a box in
     the middle of a dark rectangle. */
  t("the canvas fills what it is given", code.indexOf("c.width = Math.round(w * dpr)") > -1, true);
  t("and is no longer square", code.indexOf("Math.min(window.innerWidth, window.innerHeight)") > -1, false);
  t("its page has no vmin in it", grab("spec3dPage").indexOf("height:100vmin") === -1, true);
  t("and fills the viewport", grab("spec3dPage").indexOf("width:100vw;height:100vh") > -1, true);

  /* "The design is very ugly." Flat solid polygons with a thin outline is a
     low-poly toy. A hologram is mostly edges. */
  t("the faces are a wash you can see through", code.indexOf("0.13 + q.light * 0.10") > -1, true);
  /* It laid a wide soft pass under the bright one to fake a glow - measured,
     that was a third of all the drawing for the least of the look. One fill
     and one stroke now, and the line is a little stronger. */
  t("and the edges are what you read the shape from",
    code.indexOf("g.strokeStyle = shade(q.c, 1.2, 0.95)") > -1, true);
  t("one fill and one stroke, not two strokes",
    (code.match(/g\.stroke\(/g) || []).length, 1);
  t("and a face too small to see is not drawn at all",
    code.indexOf("if(q.small) continue;") > -1, true);
  t("thirty frames a second, not sixty",
    code.indexOf("now - LAST < 32") > -1, true);
  t("every colour is pulled towards one light", code.indexOf("function parts3") > -1, true);
  t("but not all the way, or the parts cannot be told apart",
    code.indexOf("var m = 0.62;") > -1, true);
  /* the grid stopped moving when panning went, so eighteen strokes a frame
     became one copy of a canvas drawn once */
  t("and it stands on something", code.indexOf("function makeGrid") > -1, true);
  t("drawn once and stamped, not eighteen strokes a frame",
    code.indexOf("g.drawImage(GRID, 0, 0)") > -1, true);
  t("with lines across it and darker edges",
    grab("spec3dPage").indexOf("#scan") > -1 && grab("spec3dPage").indexOf("#vig") > -1, true);
  t("the name is sized for the screen, not for a square",
    code.indexOf("var unit = Math.min(W, H);") > -1, true);

  /* built from a photograph rather than from memory */
  t("a real photograph is fetched first", has("function refPhoto"), true);
  t("Wikipedia's images allow it, so it is real data and not a description",
    grab("refPhoto").indexOf("readAsDataURL") > -1, true);
  t("an enormous one is refused rather than sent",
    grab("refPhoto").indexOf("blob.size > 3500000") > -1, true);
  t("and the model is asked to build what it can see",
    grab("spec3dFromPhoto").indexOf("not what you remember about") > -1, true);
  t("with no picture, it falls back rather than failing",
    grab("spec3dFromPhoto").indexOf("if(!shot) return null") > -1, true);

  /* tapping one part is gone; asking names them all */
  t("tapping a part is gone", code.indexOf("pedroPart") === -1, true);
  /* He asked for the labels gone: what is left is the thing itself, every
     part showing through the ones in front of it, turning. */
  t("nothing labels the parts", code.indexOf("LABELS_ON") > -1, false);
  t("nor is there anything to turn them on", has("function holoLabels"), false);
  t("and the parts show through each other instead",
    code.indexOf("a wash you can see through") > -1, true);
  const parts = new Function(decl("PARTS_RE") + " return PARTS_RE;")();
  ["what parts", "what parts is it made of", "which parts are used",
   "label the parts", "name the parts", "parts", "what is it made of"]
    .forEach(q => t('"' + q + '" asks what it is made of', parts.test(q), true));
  /* "what parts" names them out loud now - nothing is written on the model */
  t("and asking names them out loud",
    grab("rightNow").indexOf('names.join(", ")') > -1, true);
  t("but an ordinary question does not", parts.test("what is the capital of france"), false);
  t("and nothing up is said, not silently ignored",
    grab("rightNow").indexOf("There is nothing up to take apart") > -1, true);

  /* ---- the party hat and the lights ---- */
  t("the ball gets a hat", inPage('<span class="hat"'), true);
  t("which is a striped cone", /#hfOrb\.party \.hat\{[\s\S]*?repeating-linear-gradient/.test(page), true);
  t("with a pompom", inPage("#hfOrb.party .hat .pom{"), true);
  t("and it bobs", inPage("@keyframes hatBob"), true);
  t("but only during a party", /#hfOrb \.hat\{display:none\}/.test(page), true);
  t("there is a string of bulbs along the top", inPage("#partyLights .bulbs{"), true);
  t("that blink out of step with each other", inPage("#partyLights .bulbs s:nth-child(9)"), true);
  /* the beams hung from one point in the middle, which put their length down
     the centre where the ball already is */
  t("the beams are spread across the top", inPage("#partyLights i:nth-child(4){left:84%"), true);
  t("and they are bright", /#partyLights i\{[^}]*opacity:1/.test(page), true);
}


/* ---------- the rest of what iOS allows ---------- */
{
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");
  const TOOLS = new Function("Native", "APPS", "appNamed", "openThing", "whenIsThat",
    "startTimer", "diaryNext", "eventSaid", "nat", "camOpen", "camAsk",
    "nativeMicSupported", "store", "shortcutNames",
    decl("TOOLS") + " return TOOLS;")(null, {}, () => null, () => Promise.resolve(),
      () => null, () => {}, () => Promise.resolve([]), () => "", () => Promise.resolve({}),
      () => {}, () => {}, () => true, { settings:{} }, () => []);

  t("every one says what it needs, what it does, and what words reach it",
    Object.keys(TOOLS).filter(k => !(TOOLS[k].needs && TOOLS[k].tell &&
      typeof TOOLS[k].run === "function" && TOOLS[k].words && TOOLS[k].words.length)).length, 0);

  ["calendar.list", "reminder.list", "notify.at", "media.control",
   "maps.show"].forEach(k =>
    t(k + " is one of them", !!TOOLS[k], true));

  /* the phone's side of each */
  ["notify", "notifyCancel", "mediaControl", "nowPlaying", "remindersList"].forEach(m => {
    t(m + " is offered to the app", sw.indexOf('CAPPluginMethod(name: "' + m + '"') > -1, true);
    t(m + " is written", sw.indexOf("@objc func " + m + "(") > -1, true);
  });
  t("notifications come from the real framework", sw.indexOf("import UserNotifications") > -1, true);
  t("and media from the real one too", sw.indexOf("import MediaPlayer") > -1, true);
  /* being asked for something before you have wanted it is how permission gets
     refused - so it is asked for at the moment one is set */
  t("permission is asked when a notification is set, not at start",
    sw.indexOf("centre.requestAuthorization") > -1 &&
    sw.indexOf("@objc func notify") < sw.indexOf("centre.requestAuthorization"), true);
  t("a time already gone is refused rather than fired at once",
    sw.indexOf("that time has already gone past") > -1, true);
  t("only reminders that are not done come back",
    sw.indexOf("predicateForIncompleteReminders") > -1, true);
  t("soonest first", sw.indexOf("return da < db") > -1, true);
  /* third-party players keep playback to themselves - saying otherwise would
     have him claim he had done something he had not */
  t("media control says which player it moves",
    sw.indexOf("Third-party apps") > -1, true);

  /* Shortcuts: iOS will not list them, so he cannot run one he has never
     heard of. Telling him the names is the whole fix. */
  t("there is somewhere to type your Shortcuts", has('id="setShortcuts"'), true);
  t("and they reach the prompt", grab("shortcutNames").indexOf("store.settings.shortcuts") > -1, true);
  t("a tool that describes itself is asked, not pasted",
    grab("toolsBlock").indexOf('typeof tell === "function" ? tell()') > -1, true);
  const names = new Function("store", grab("shortcutNames") + " return shortcutNames;")(
    { settings: { shortcuts: "Morning Routine, Drive Home ,, Wind Down" } })();
  t("they are split and tidied", names, ["Morning Routine", "Drive Home", "Wind Down"]);
  t("and near enough finds one",
    TOOLS["shortcut.run"].run.toString().indexOf("indexOf(name.toLowerCase()) > -1") > -1, true);
  t("nothing named asks which", TOOLS["shortcut.run"].run.toString().indexOf("which shortcut?") > -1, true);
}


/* ---------- games ---------- */
{
  const TOPICS = new Function(decl("TRIVIA_TOPICS") + " return TRIVIA_TOPICS;")();
  t("there are ten topics", TOPICS.length, 10);
  t("each has something to say and a number to fetch by",
    TOPICS.every(x => x.say && x.id), true);
  t("saying trivia lists them", grab("triviaStart").indexOf("Pick one:") > -1, true);
  t("then asks how many are playing", grab("triviaAskPlayers").indexOf("How many are playing") > -1, true);
  t("and the questions come from the web, with no key",
    grab("triviaFetch").indexOf("opentdb.com") > -1, true);
  t("twenty at a time, so a game does not stop halfway",
    grab("triviaFetch").indexOf("amount=20") > -1, true);
  /* they arrive with HTML entities in them, which would be read out as "quot" */
  t("the questions are turned back into readable text",
    grab("triviaFetch").indexOf("triviaPlain") > -1, true);
  t("and the answers are shuffled, or the right one is always last",
    grab("triviaFetch").indexOf("Math.floor(Math.random() * (i + 1))") > -1, true);
  t("first to five wins", grab("triviaAnswer").indexOf(">= 5") > -1, true);
  t("and turns go round the players", grab("triviaAnswer").indexOf("(game.turn + 1) % game.players") > -1, true);
  t("running out of questions ends it rather than hanging",
    grab("triviaNext").indexOf("I have run out of questions") > -1, true);

  const topic = new Function(decl("TRIVIA_TOPICS") + grab("triviaTopic") + " return triviaTopic;")();
  [["film", "film"], ["films", "film"], ["movies", "film"], ["the movies", "film"],
   ["music", "music"], ["songs", "music"], ["tv", "television"], ["video games", "video games"],
   ["gaming", "video games"], ["sport", "sport"], ["football", "sport"],
   ["geography", "geography"], ["countries", "geography"], ["history", "history"]]
    .forEach(([said, want]) => t('"' + said + '" is ' + want,
      (topic(said) || {}).say, want));
  t("and something that is not a topic is not guessed at", topic("bananas"), null);

  /* said aloud, an answer is either the answer or its place in the list */
  const judge = new Function("game", grab("triviaJudge") + " return triviaJudge;")(
    { q: { right: "Mercury", all: ["Venus", "Mercury", "Mars", "Earth"] } });
  [["Mercury", true], ["mercury", true], ["Mercury.", true],
   ["b", true], ["the second one", true], ["number two", true], ["second", true],
   ["Venus", false], ["a", false], ["the third one", false], ["bananas", false]]
    .forEach(([said, want]) => t('"' + said + '" judged right', judge(said), want));

  /* truth or dare */
  const TRUTHS = new Function(decl("TRUTHS") + " return TRUTHS;")();
  const DARES = new Function(decl("DARES") + " return DARES;")();
  t("there are plenty of truths", TRUTHS.length >= 15, true);
  t("and plenty of dares", DARES.length >= 15, true);
  t("none of them are questions to a machine",
    TRUTHS.every(x => x.length > 20) && DARES.every(x => x.length > 20), true);
  /* a game that asks you the same question twice in five minutes stops being
     a game */
  const fresh = new Function(grab("pickFresh") + " return pickFresh;")();
  const seen = [], got = new Set();
  for(let i = 0; i < TRUTHS.length; i++) got.add(fresh(TRUTHS, seen));
  t("nothing repeats until the list has been round once", got.size, TRUTHS.length);
  t("and then it starts again rather than running out",
    (() => { const s = []; for(let i = 0; i < TRUTHS.length + 3; i++) fresh(TRUTHS, s);
             return s.length <= TRUTHS.length; })(), true);

  /* while a game is on, what you say is a move in it */
  t("a game takes what is said", grab("hfAsk").indexOf("if(gameOn())") > -1, true);
  t("and it is not answered as a question as well",
    grab("hfAsk").indexOf("if(gameHeard(question)) return;") > -1, true);
  t("stop ends any of them", grab("gameHeard").indexOf("stop|quit|end|enough") > -1, true);
  const TRIVIA_RE = new Function(decl("TRIVIA_RE") + " return TRIVIA_RE;")();
  const TD_RE = new Function(decl("TD_RE") + " return TD_RE;")();
  ["trivia", "quiz", "play trivia", "trivia time"].forEach(q =>
    t('"' + q + '" starts trivia', TRIVIA_RE.test(q), true));
  ["truth or dare", "play truth or dare"].forEach(q =>
    t('"' + q + '" starts truth or dare', TD_RE.test(q), true));
  /* the regex was tested and the wiring was not, so this was dead for a whole
     build with every test green - a pattern nothing consults is not a feature */
  t("and something actually consults them",
    grab("rightNow").indexOf("TRIVIA_RE.test(q)") > -1 &&
    grab("rightNow").indexOf("TD_RE.test(q)") > -1, true);
  t("as it does for every other word he answers to",
    ["PARTS_RE", "PARTY_ON_RE", "PARTY_OFF_RE"].every(function(n){
      return grab("rightNow").indexOf(n + ".test(q)") > -1; }), true);
  t("but talking about trivia does not start it", TRIVIA_RE.test("that is trivia"), false);
}


/* ---------- stop, the lists, and looking at things ---------- */
{
  const page = fs.readFileSync("index.html", "utf8");
  const inPage = s => page.indexOf(s) > -1;

  /* there were four ways out of four things and you had to know which you were in */
  const back = grab("backToNormal");
  ["gameOn()", "holoHide()", "vizStop()", "partySet(false)"]
    .forEach(x => t("stop puts away " + x, back.indexOf(x) > -1, true));
  t("and every panel with it", back.indexOf(".hudpanel[data-panel].on") > -1, true);
  t("and it says when there was nothing to stop",
    grab("rightNow").indexOf("Nothing to stop.") > -1, true);

  /* the two lists */
  const FEATURES = new Function(decl("FEATURES") + " return FEATURES;")();
  t("there is a list of what he answers to", FEATURES.length > 40, true);
  t("each with what it does", FEATURES.every(f => f.say && f.does), true);
  t("and it is sorted when it is shown",
    grab("fillPanel").indexOf("localeCompare") > -1, true);
  /* it is written out rather than scraped, so a test has to keep it honest */
  const NOW_RE = new Function(decl("NOW_RE") + " return NOW_RE;")();
  const flat = FEATURES.map(f => f.say.toLowerCase()).join(" | ");
  ["time", "date", "weather", "battery", "brief", "next", "check"].forEach(k =>
    t("the list mentions " + k, flat.indexOf(k === "brief" ? "status" :
      k === "check" ? "diagnostics" : k) > -1, true));
  t("and the tools list is built from the tools themselves, so it cannot lie",
    grab("toolsShow").indexOf("Object.keys(TOOLS)") > -1, true);
  t("saying which need a tap", grab("toolsShow").indexOf("iOS needs the tap") > -1, true);
  t("close gui shuts whatever is open", has("function guiClose"), true);
  t("and says so when nothing is", grab("rightNow").indexOf("Nothing is open.") > -1, true);
  t("the panel scrolls, because the list is long",
    /#featuresList\{[^}]*overflow-y:auto/.test(page), true);

  /* The camera is gone, and with it the branch of the spoken prompt that
     announced a photograph. What is left is one thing, not a choice. */
  t("nothing announces a photograph", has("PHOTOGRAPH attached"), false);
  t("and nothing tracks one in flight", has("var lookingAt"), false);
  t("the spoken prompt says what it always said about misheard speech",
    grab("systemPrompt").indexOf("sometimes half-heard") > -1, true);
}

/* ---------- reading up on something, and then knowing it ---------- */
{
  /* He would read up on "diodes", store fifteen notes, say "ask me anything
     about it" - and then find nothing when asked "what is a diode".

     relevance scores a word of six letters two points and one of five only
     one, and the threshold was two. "diodes" is six letters and "diode" is
     five, so the most obvious question missed by exactly one point. */
  const named = new Function(grab("namesTopic") + " return namesTopic;")();
  [["what is a diode", "diodes"], ["how does a diode work", "diodes"],
   ["what is a battery", "batteries"], ["how do batteries work", "batteries"],
   ["tell me about the roman empire", "the roman empire"],
   ["when did the roman empire fall", "the roman empire"]]
    .forEach(([q, topic]) => t('"' + q + '" names ' + topic, named(q, topic), true));
  ["what is the capital of france", "tell me a joke", "what time is it"]
    .forEach(q => t('"' + q + '" names no subject', named(q, "diodes"), false));

  /* a stem that strips "es" before "s" turns diodes into diod while diode
     stays diode, so the two never meet - which is why the first fix did not
     work either */
  t("it compares every form of a word, not one stem for both",
    grab("namesTopic").indexOf("function forms") > -1, true);
  t("naming the subject counts for more than a word in the notes",
    grab("studyFor").indexOf("score += 4") > -1, true);
  t("and why is written down where the next person will look",
    grab("studyFor").indexOf("missed the threshold by a single point") > -1, true);

  /* what he reads has to survive the shapes a model replies in */
  const read = new Function(grab("readNotes") + " return readNotes;")();
  t("a clean json array is read", read('["one thing","another thing here"]').length, 2);
  t("curly quotes are straightened first",
    read("[“one thing here”,“another thing here”]").length, 2);
  t("a plain list is read too",
    read("- the first note here\n- the second note here").length, 2);
  t("a numbered one as well",
    read("1. the first note here\n2. the second note here").length, 2);
  t("and nothing usable gives nothing rather than rubbish", read("ok").length, 0);
}


/* ---------- reading up on something properly ---------- */
{
  /* Three passes of eight notes capped at thirty is a summary, not an
     education. He asked for everything, even if it takes a while. */
  const PASSES = new Function(decl("LEARN_PASSES") + " return LEARN_PASSES;")();
  t("there are ten angles on a subject", PASSES.length, 10);
  t("each one asks something different", new Set(PASSES.map(p => p.ask)).size, 10);
  t("and each has a name for the countdown", PASSES.every(p => p.name), true);
  ["the numbers", "going wrong", "the history", "the edges", "the deep end"]
    .forEach(n => t('"' + n + '" is one of them',
      PASSES.some(p => p.name === n), true));

  const learn = grab("learnAbout");
  t("twelve notes a pass, not eight", learn.indexOf("array of 12 short factual notes") > -1, true);
  t("and specific ones - names, numbers, units",
    learn.indexOf("names, numbers, units, real examples") > -1, true);
  t("a hundred and twenty are kept, not thirty", learn.indexOf("kept.slice(0, 120)") > -1, true);
  /* ten passes over one subject will say some things twice however carefully
     they are asked */
  t("and anything said twice is dropped", learn.indexOf("if(seen[key]) return;") > -1, true);

  /* without this he is writing down what the model happens to remember, which
     is the difference between reading up on something and reciting it */
  t("it reads the web about the subject first", learn.indexOf("webLook(topic, 3)") > -1, true);
  t("and hands what it found to every pass",
    learn.indexOf("Here is what the web says about it") > -1, true);
  t("the reading happens before the thinking", learn.indexOf("readFirst(runPass)") > -1, true);
  t("and no web is not a reason to give up",
    learn.indexOf('typeof webLook !== "function"') > -1, true);

  /* a minute is a long time to be unable to change your mind */
  t("it can be stopped part way", has("var learnStop"), true);
  t("stop ends it", grab("backToNormal").indexOf("learnStop") > -1, true);
  t("and says how far it got", learn.indexOf("notes on ' + topic + ' before you did") > -1, true);
}


console.log(fail ? NL + fail + " FAILURES" : NL + "All " + pass + " JARVIS tests passed");
process.exit(fail ? 1 : 0);