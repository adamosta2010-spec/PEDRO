/* Two things that were broken in the same way - the code existed, but nothing
   could ever reach it.
   "Stop" was unhearable: the microphone was closed the moment you finished
   asking, and hfHeardText ignored everything unless it was waiting or hearing.
   A simulation could end up showing nothing at all, with the model's own
   "sure, here's the code" read out as though it were the answer. */
const fs = require("fs");
/* the file is CRLF on this machine; the patterns below are written with
   plain newlines, so read it in those terms */
const src = fs.readFileSync(process.argv[2], "utf8").split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
/* braces live inside strings and regexes, so the shared reader asks the
   JavaScript engine which slice is a whole function rather than guessing */
const { grab, decl } = require("./lib").reader(src);

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};
const has = s => src.indexOf(s) > -1;

/* ---------------- stop, while he is going ---------------- */
{
  const heard = grab("hfHeardText");
  t("what he hears while talking is looked at at all",
    heard.indexOf('hf.phase === "talk"') > -1, true);
  t("and while thinking too", heard.indexOf('hf.phase === "busy"') > -1, true);
  t("stop over the top of him stops him", heard.indexOf("hfStopIt()") > -1, true);
  t("pause over the top of him pauses him", heard.indexOf("hfPauseIt()") > -1, true);
  t("anything else heard then is ignored rather than answered",
    heard.indexOf("/* not for us") > -1 || heard.indexOf("not for us") > -1, true);
  t("and it is not written down as something you said",
    heard.indexOf('hudLog("you"') > heard.indexOf('hf.phase === "talk"'), true);

  t("the microphone is no longer closed the moment you finish asking",
    grab("hfAsk").indexOf("hfPause();") === -1, true);
  t("but the timers still are",
    grab("hfAsk").indexOf("clearTimeout(hf.settle)") > -1, true);

  const stop = grab("hfStopIt");
  t("stopping cuts the speech off", stop.indexOf("hfQuiet()") > -1, true);
  t("stopping abandons what he was writing", stop.indexOf("abortCtl.abort()") > -1, true);
  t("stopping drops the head start", stop.indexOf("hfDropDraft()") > -1, true);
  t("stopping leaves him listening", stop.indexOf("hfListen()") > -1, true);
  const quiet = grab("hfQuiet");
  ["sayStop()", "elevenAudio", "Native.stopSpeaking", "speechSynthesis.cancel"].forEach(bit =>
    t("stopping silences " + bit, quiet.indexOf(bit) > -1, true));
  t("the spoken command and the barge-in use the same stop",
    (src.match(/hfStopIt\(\)/g) || []).length >= 2, true);
}

/* ---------------- the orb keeps what is on it ---------------- */
{
  /* vizShow puts a simulation up by adding "showing" to the orb, then changes
     the label - and hfSet used to assign className outright, wiping it off a
     line later. That is why nothing ever appeared. */
  const set = grab("hfSet");
  t("the phase is set without wiping the other classes",
    set.indexOf("hfOrb.className =") === -1, true);
  t("it removes only the phases it knows", set.indexOf("HF_PHASES") > -1, true);
  t("and adds the new one", set.indexOf("classList.add") > -1, true);
  t("showing is never in that list",
    src.match(/var HF_PHASES = [^;]*;/)[0].indexOf("showing") === -1, true);
}

/* ---------------- a simulation always shows something ---------------- */
{
  const build = grab("vizBuild");
  t("when no code comes back it asks again, plainly",
    build.indexOf("Reply with nothing but one fenced html block") > -1, true);
  t("it does not read the promise of code out as the answer",
    build.indexOf("carryOn(parts.say") === -1, true);
  t("and if that fails it draws it here", build.indexOf("fallBack()") > -1, true);
  t("a failure of any kind falls back rather than apologising",
    build.indexOf("fallBack();      /* no signal") > -1, true);
  t("an empty code block no longer counts as finished",
    build.indexOf("close - first > 60") > -1, true);
  t("the second ask only happens once", build.indexOf("tries === 0") > -1, true);
  t("and not on the phone's own model, which cannot write a page",
    build.indexOf("!isDevice()") > -1, true);

  /* the ones he can draw with no model at all */
  const kinds = new Function(
    src.match(/var VIZ_KINDS = \[[\s\S]*?\n\];/)[0] + " return VIZ_KINDS;")();
  t("there are several to choose from", kinds.length >= 8, true);
  const pick = new Function(
    src.match(/var VIZ_KINDS = \[[\s\S]*?\n\];/)[0] + "\n" + grab("vizLocalKind") +
    " return vizLocalKind;")();
  [["an engine", "engine"], ["a piston", "engine"], ["the solar system", "orbit"],
   ["a planet orbiting", "orbit"], ["a sound wave", "wave"], ["gears turning", "gears"],
   ["a pendulum", "pendulum"], ["an atom", "atom"], ["a heart", "heart"],
   ["a bouncing ball", "bounce"], ["water flowing", "flow"]
  ].forEach(([ask, want]) => {
    const k = pick(ask);
    t('"' + ask + '" is drawn as ' + want, k && k.name, want);
  });
  t("something nobody planned for still gets one", pick("a xylophone factory"), null);

  const local = new Function(
    decl("VIZ_HEAD") + "\n" + decl("VIZ_TAIL") + "\n" +
    decl("VIZ_KINDS") + "\n" + decl("VIZ_ANY") + "\n" +
    grab("vizLocalKind") + "\n" + grab("vizLocal") + " return vizLocal;")();
  ["an engine", "the solar system", "a xylophone factory", "", "a heart"].forEach(ask => {
    const page = local(ask);
    t('"' + ask + '" always produces a page', page.length > 200, true);
    t('"' + ask + '" draws on a canvas', page.indexOf("<canvas") > -1, true);
    t('"' + ask + '" keeps animating', page.indexOf("requestAnimationFrame") > -1, true);
  });
  /* the label is put in as a JSON string inside a canvas call, so it cannot
     break out - what matters is that no markup survives to close the script */
  {
    const nasty = local(String.fromCharCode(60) + "/script" + String.fromCharCode(62) +
                        String.fromCharCode(60) + "img onerror=alert(1)" + String.fromCharCode(62));
    /* the page has one closing script tag of its own; the words must not
       add a second one, which is how you would break out of the block */
    const closers = (nasty.split(String.fromCharCode(60) + "/script").length - 1);
    t("the words cannot close the script block", closers, 1);
    t("and no stray quotes either", nasty.indexOf(String.fromCharCode(34) + "img") === -1, true);
    t("it still draws something", nasty.indexOf("requestAnimationFrame") > -1, true);
  }
}

/* ---------------- the native half of stop ---------------- */
{
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");
  t("the microphone can keep listening while he talks",
    sw.indexOf("if echoFree && wantListening { return }") > -1, true);
  t("because his own voice is taken out of what it hears",
    sw.indexOf("setVoiceProcessingEnabled(true)") > -1, true);
  t("it is turned on wherever listening starts",
    sw.split("enableEchoCancelling(node)").length - 1, 2);
  t("a device that will not do it carries on as before",
    sw.indexOf("echoFree = false") > -1, true);
  {
    /* anchored at both ends, so a sentence of his own containing the word
       "stop" cannot cut him off */
    const line = src.slice(src.indexOf("var STOP_RE"), src.indexOf("var PAUSE_RE"));
    t("the stop words are anchored at the front", line.indexOf("/^(?:") > -1, true);
    t("and at the end", line.indexOf("$/i;") > -1, true);
  }
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " stop-and-simulate tests passed");
process.exit(fail ? 1 : 0);
