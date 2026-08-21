/* The rest of the list: summaries of what came before, voice moods, notes he
   keeps himself, the weather, running a bit of code, and reading a file you
   hand over. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const { grab, decl } = require("./lib").reader(src);
let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};
const has = s => src.indexOf(s) > -1;

/* ---------- what was said before ---------- */
{
  const toSumUp = new Function("SUM_KEEP", "SUM_AFTER",
    grab("summaryOf") + grab("toSumUp") + " return toSumUp;")(6, 14);
  const chat = n => ({ messages: new Array(n).fill(0).map((_, i) =>
    ({ role: i % 2 ? "assistant" : "user", content: "line " + i })) });

  t("a short conversation is left alone", toSumUp(chat(8)).length, 0);
  t("a long one has its older part taken", toSumUp(chat(30)).length, 24);
  t("the recent messages are never summarised away",
    toSumUp(chat(30)).every(m => m.content !== "line 29"), true);
  const already = chat(40);
  already.summary = { text: "they are building an app", upto: 20 };
  t("what is already summarised is not done twice",
    toSumUp(already).length, 40 - 6 - 20);
  t("and nothing at all is safe", toSumUp(null).length, 0);

  const keep = grab("keepUp");
  t("it happens quietly, without holding up an answer",
    keep.indexOf("summaryBusy") > -1, true);
  t("only one at a time", keep.indexOf("if(summaryBusy") > -1, true);
  t("it builds on the last one rather than starting over",
    keep.indexOf("So far: ") > -1, true);
  t("a failure leaves the old summary alone",
    keep.indexOf("leave the old summary alone") > -1, true);
  t("it is kept short", keep.indexOf("five short lines") > -1, true);
  t("and it goes with every question after that",
    grab("buildRequest").indexOf("Earlier in this conversation") > -1, true);
  t("kept up after each exchange", has("keepUp(c)"), true);
}

/* ---------- how he sounds ---------- */
{
  const moods = new Function(decl("MOODS") + " return MOODS;")();
  ["normal", "calm", "excited", "serious", "gentle"].forEach(m =>
    t(m + " is one of the moods", !!moods[m], true));
  t("excited is livelier than serious", moods.excited.style > moods.serious.style, true);
  t("serious is steadier than excited", moods.serious.stability > moods.excited.stability, true);
  t("calm is slower than normal", moods.calm.speed < moods.normal.speed, true);
  t("excited is quicker", moods.excited.speed > moods.normal.speed, true);
  t("every mood but normal says how to write too",
    Object.keys(moods).filter(k => k !== "normal").every(k => moods[k].tone.length > 10), true);

  const set = new Function(decl("MOODS") + grab("moodSet") +
    " return function(name, store){ this.store = store; return moodSet(name); };");
  /* the words people actually use */
  const pick = new Function("store", "save", decl("MOODS") + grab("moodSet") +
    " return moodSet;")({ settings:{} }, function(){});
  [["excited", "excited"], ["happy", "excited"], ["hyped", "excited"],
   ["calm", "calm"], ["chill", "calm"], ["relax", "calm"],
   ["serious", "serious"], ["professional", "serious"],
   ["gentle", "gentle"], ["kind", "gentle"],
   ["normal", "normal"], ["back to normal", "normal"]
  ].forEach(([said, want]) => {
    const got = pick(said);
    t('"' + said + '" means ' + want, got && got.say, want);
  });
  t("something that is not a mood is not forced into one", pick("bananas"), null);
  t("the voice is actually spoken in it", has("stability: moodNow().stability"), true);
  t("and he is told to write in it too", has("moodNow().tone"), true);
}

/* ---------- notes he keeps ---------- */
{
  const tools = new Function("Native", "APPS", "appNamed", "openThing", "whenIsThat",
    "startTimer", "notes", "uid", "save", "whereIsIt", "weatherAt", "runInSandbox", "lastFile",
    decl("TOOLS") + " return TOOLS;")(null, {}, () => null, () => Promise.resolve(),
    () => null, () => {}, () => [], () => "1", () => {}, null, null, null, null);
  t("he can write something down", !!tools["note.write"], true);
  t("and read it back", !!tools["note.find"], true);
  t("writing one does not need a tap any more", tools["note.write"].hands, false);
  t("because it is kept here, not in the Notes app",
    grab("notes").indexOf("store.settings.notes") > -1, true);
}

/* ---------- the weather ---------- */
{
  t("there is a weather tool", has('"weather.now"'), true);
  t("it needs no key and no account", has("open-meteo.com"), true);
  t("naming a place sends only the place",
    grab("whereIsIt").indexOf("geocoding-api.open-meteo.com") > -1, true);
  t("and asking for here asks the phone, which asks you",
    grab("whereIsIt").indexOf("navigator.geolocation") > -1, true);
  t("a place nobody has heard of is said, not guessed at",
    grab("whereIsIt").indexOf("I could not find") > -1, true);
  const sky = new Function(decl("SKY") + " return SKY;")();
  t("the codes are turned into words", sky[0], "clear");
  t("including the bad ones", sky[95], "a thunderstorm");
}

/* ---------- running a bit of code ---------- */
{
  const box = grab("runInSandbox");
  t("the code runs in a frame of its own", box.indexOf("createElement(\"iframe\")") > -1, true);
  t("sealed, with no way back into the app", box.indexOf('"sandbox", "allow-scripts"') > -1, true);
  t("and no network", box.indexOf("default-src 'none'") > -1, true);
  t("it runs in a worker, which can be stopped", box.indexOf("new Worker(url)") > -1, true);
  t("a runaway is terminated rather than left spinning",
    box.indexOf("w.terminate()") > -1, true);
  t("taking the frame away is not enough, and that is written down",
    box.indexOf("too") > -1 && box.indexOf("busy spinning") > -1, true);
  t("there is a time limit", box.indexOf("3000") > -1, true);
  t("anything printed comes back", box.indexOf("console={log") > -1, true);
  t("and an error is reported rather than swallowed",
    box.indexOf("'Error: '+e.message") > -1, true);
}

/* ---------- a file you hand over ---------- */
{
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");
  t("reading a file is offered to the app",
    sw.indexOf('CAPPluginMethod(name: "readFile"') > -1, true);
  t("it opens the picker rather than searching",
    sw.indexOf("UIDocumentPickerViewController") > -1, true);
  t("you choose one file, not many", sw.indexOf("allowsMultipleSelection = false") > -1, true);
  t("the picker has something to hand it back to",
    sw.indexOf("UIDocumentPickerDelegate") > -1, true);
  t("cancelling is handled, not left hanging",
    sw.indexOf("documentPickerWasCancelled") > -1, true);
  t("an enormous file is cut down", sw.indexOf("prefix(200_000)") > -1, true);
  t("and the app says plainly that it cannot go looking",
    src.indexOf("cannot go looking through their files") > -1, true);
}

/* ---------- the phone should not be dragged down ---------- */
{
  t("nothing animates while the dashboard is away",
    has("#hf:not(.on) *,") && has("animation-play-state: paused"), true);
  t("nor while the app is in the background", has("body.away *"), true);
  t("and the page says when it is away", has('classList.toggle("away"'), true);
  t("what is hidden behind a simulation stops drawing too",
    has("#hfOrb.showing .wave i,"), true);
  t("blurring what is behind is dropped on a phone",
    has("backdrop-filter:none !important"), true);
}

/* ---------- he stops going deaf after one answer ---------- */
{
  const fresh = grab("hfFreshMic");
  t("the microphone is started over, not just stopped",
    fresh.indexOf("hfListen()") > -1, true);
  t("and the new one waits for the old one to actually go",
    fresh.indexOf("then(again, again)") > -1, true);
  t("carrying on uses it", grab("carryOn").indexOf("hfFreshMic()") > -1, true);
  t("and no longer stops and starts in the same breath",
    grab("carryOn").indexOf("hfPause();") === -1, true);
}

/* ---------- he stops cutting in ---------- */
{
  const settle = grab("hfSettle");
  t("a pause mid-sentence is no longer taken as the end",
    settle.indexOf("380") === -1, true);
  t("it waits a beat", settle.indexOf("620") > -1, true);
  t("and much longer when the sentence is plainly unfinished",
    settle.indexOf("1100") > -1, true);
  const hanging = new Function(decl("HF_HANGING") + " return HF_HANGING;")();
  t("there are plenty of words that mean he is still going", hanging.length > 60, true);
  ["about", "into", "really", "want", "three"].forEach(w =>
    t('"' + w + '" counts as still going', hanging.indexOf(w) > -1, true));
}

/* ---------- learning actually learns ---------- */
{
  const FENCE = String.fromCharCode(96, 96, 96);
  const NEWLINE = String.fromCharCode(10);
  const OPEN = String.fromCharCode(8220), SHUT = String.fromCharCode(8221);
  const read = new Function(grab("readNotes") + " return readNotes;")();
  const LIST = "[\"a fact about it here\",\"and another one\"]";

  t("a clean list is read", read(LIST).length, 2);
  t("a list in a fence is read",
    read(FENCE + "json" + NEWLINE + LIST + NEWLINE + FENCE).length, 2);
  t("a list with words in front of it is read",
    read("Sure, here they are:" + NEWLINE + LIST).length, 2);
  t("bullets are read",
    read("- one fact about it here" + NEWLINE + "- two facts about it here").length, 2);
  t("numbers are read",
    read("1. one fact about it here" + NEWLINE + "2. two facts about it here").length, 2);
  t("curly quotes are read too",
    read("[" + OPEN + "one fact about it" + SHUT +
         "," + OPEN + "two facts about it" + SHUT +
         "]").length, 2);
  t("and nothing useful gives nothing", read("").length, 0);

  const learn = grab("learnAbout");
  t("learning uses the online model, not the phone's",
    learn.indexOf("store.settings.provider = \"gemini\"") > -1, true);
  t("and puts the setting back whether it works or not",
    (learn.match(/provider = wasProvider/g) || []).length, 2);
  t("it no longer insists on JSON",
    learn.indexOf("readNotes(answer)") > -1, true);
}

/* ---------- he should never go deaf ---------- */
{
  const should = new Function("hf", "cam", grab("shouldBeListening") + " return shouldBeListening;");
  const on = { on:true, want:true, paused:false, phase:"hear" };
  t("listening when he is meant to be", should(on, {open:false})(), true);
  t("not while he is thinking", should(Object.assign({}, on, {phase:"busy"}), {open:false})(), false);
  t("not while he is talking", should(Object.assign({}, on, {phase:"talk"}), {open:false})(), false);
  t("not when hands-free is off", should(Object.assign({}, on, {want:false}), {open:false})(), false);
  t("not when you paused him", should(Object.assign({}, on, {paused:true}), {open:false})(), false);
  t("not while the camera is up", should(on, {open:true})(), false);

  const keep = grab("keepHearing");
  t("a stopped microphone is started again", keep.indexOf("hfListen()") > -1, true);
  t("one that has heard nothing for a long time is replaced",
    keep.indexOf("hfFreshMic()") > -1, true);
  t("and it is looked at over and over", src.indexOf("setInterval(keepHearing") > -1, true);
  t("anything heard counts as proof it is alive",
    grab("hfHeardText").indexOf("hf.lastHeard = Date.now()") > -1, true);
  t("and the silence is measured from when it started",
    grab("hfListen").indexOf("hf.since = Date.now()") > -1, true);
}

/* ---------- one missing native method must not take the app down ---------- */
{
  const n = grab("nat");
  t("a native call that is not there is refused, not thrown",
    n.indexOf("Promise.reject") > -1, true);
  t("and a throw inside it becomes a refusal too",
    n.indexOf("catch(e)") > -1, true);
  /* every call into the app goes through nat() or natListen() - counted
     rather than matched, because a pattern here is one more thing to get
     wrong */
  t("every native call goes through the safe way in",
    src.split("nat(" + String.fromCharCode(34)).length - 1 >= 15, true);
  t("listeners are guarded the same way", src.indexOf("function natListen") > -1, true);
}

/* ---------- he arrives already taught ---------- */
{
  const house = new Function(decl("HOUSE_LESSONS") + " return HOUSE_LESSONS;")();
  t("he starts with lessons rather than none", house.length >= 15, true);
  t("every one is a question and an answer",
    house.every(l => l.q && l.a && l.q.length > 2 && l.a.length > 2), true);

  /* the ones that matter most, each written from something that went wrong */
  const asked = q => house.filter(l => l.q === q)[0];
  t("a short question gets a short answer",
    asked("what is the capital of france").a.length < 12, true);
  t("half-heard words get said so, not explained away",
    /did not catch/.test(asked("brrm the the").a), true);
  t("a request to text shows the tool, not a claim to have sent it",
    /message.write/.test(asked("text mum that i am running late").a), true);
  t("something he cannot know is said plainly",
    /do not know|cannot see/.test(asked("what is my bank balance").a), true);
  t("a thing to be built is described in real parts",
    /hull|tracks|turret/.test(asked("simulate a tank").a), true);
  t("and in the right proportions",
    /long and low|wider than/.test(asked("simulate a tank").a), true);

  const pick = grab("pickLessons");
  t("they are drawn on alongside anything he is taught",
    pick.indexOf("best(HOUSE_LESSONS)") > -1, true);
  /* they must not turn up on a question they have nothing to do with - that
     put a joke and a bank balance in front of every unrelated question */
  t("but only when they bear on the question",
    pick.indexOf("never the built-in ones") > -1, true);
  t("and the fallback shows only what Adam taught",
    pick.indexOf("return mine.slice(") > -1, true);
  t("and what Adam teaches him comes first",
    grab("allLessons").indexOf("lessons().concat(HOUSE_LESSONS)") > -1, true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " everything-else tests passed");
process.exit(fail ? 1 : 0);
