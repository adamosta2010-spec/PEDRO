/* Microphone diagnosis + picture-model recovery. */
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

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

/* ---- what the phone's recogniser says when it refuses ---- */
eval(grab("micError"));
t("permission trouble points at the phone's own settings",
  /Settings/i.test(micError("not allowed")) && /Speech Recognition/i.test(micError("not allowed")), true);
t("a denial is treated the same as a refusal",
  micError("denied"), micError("not allowed"));
t("a missing language is its own message",
  /language/i.test(micError("recogniser unavailable")), true);
t("silence is explained", /speak up/i.test(micError("no speech detected")), true);
t("nothing to report stays quiet", micError(""), "");
t("anything else still names the reason",
  micError("something odd").includes("something odd"), true);
t("every reason returns a string",
  ["not allowed", "denied", "no speech", "", "x"].every(c => typeof micError(c) === "string"), true);

/* ---- it says which Pedro is running, because that decides everything ---- */
function whereIn(env){
  const fn = new Function("Native", "window", "isiOS",
    grab("runningWhere") + "; return runningWhere();");
  return fn(env.native || null, { Capacitor: env.capacitor || undefined }, !!env.ios);
}
t("the app with its native half is the working case",
  whereIn({ native:{}, capacitor:{}, ios:true }).ok, true);
t("the app without its native half is named as such",
  /native half/i.test(whereIn({ capacitor:{}, ios:true }).text), true);
t("a half-loaded app is still reported as the app",
  whereIn({ capacitor:{}, ios:true }).app, true);
t("the website is told it cannot listen at all",
  /website/i.test(whereIn({ ios:true }).text) &&
  /installed app/i.test(whereIn({ ios:true }).text), true);
t("the website is not mistaken for the app", whereIn({ ios:true }).app, false);
t("no version of this blames Safari any more",
  [whereIn({ native:{}, capacitor:{} }), whereIn({ capacitor:{} }), whereIn({})]
    .every(r => !/Safari/i.test(r.text)), true);

/* ---- and the complaint itself follows from that ---- */
function micProblemIn(env){
  const fn = new Function("Native", "window", "isiOS", "nativeMicSupported",
    grab("runningWhere") + ";" + grab("micProblem") + "; return micProblem();");
  return fn(env.native || null, { Capacitor: env.capacitor || undefined }, !!env.ios,
            () => !!env.native);
}
t("in the app there is nothing to complain about",
  micProblemIn({ native:{}, capacitor:{} }), null);
t("on the website it explains the app is needed",
  /installed app/i.test(micProblemIn({})), true);
t("the Web Speech API is gone from the app entirely",
  src.includes("webkitSpeechRecognition") || src.includes("new SR()"), false);

/* ---- picture recovery is actually wired up ---- */
const draw = grab("drawPicture");
t("drawPicture takes a retry flag", /function drawPicture\(c, prompt, attach, retried\)/.test(draw), true);
t("it reloads the model list on a stale model", draw.includes("loadGeminiModels"), true);
t("it picks a different picture model",
  draw.includes("id !== store.settings.imageModel"), true);
t("it retries once, not forever", draw.includes("drawPicture(c, prompt, attach, true)") &&
  draw.includes("!retried"), true);
t("no image models at all is explained",
  /no picture models/i.test(draw), true);
t("a cancelled draw stays silent", draw.includes('err.name === "AbortError"'), true);

/* ---- hands-free has to use whichever recogniser the device actually has ---- */
/* the failure mode here is silence: the orb says Listening and nothing happens */
{
  const listen = grab("hfListen");
  const nat    = grab("hfListenNative");
  const heard  = grab("hfHeardText");
  const pause  = grab("hfPause");
  const close  = grab("hfClose");
  const inIt = (src, bit) => src.indexOf(bit) > -1;

  t("hands-free listens through the phone", inIt(listen, "hfListenNative()"), true);
  t("there is no browser recogniser left to fall back to", inIt(listen, "new SR"), false);
  t("the native path starts the microphone the button uses", inIt(nat, "nativeMicStart("), true);
  t("it marks itself so stopping knows which one is running", inIt(nat, "native: true"), true);
  t("it listens again after Apple stops itself on a pause", inIt(nat, "setTimeout(hfListen"), true);
  t("a blocked microphone ends the loop instead of spinning", inIt(nat, "hf.want = false"), true);
  t("both recognisers share the wake-word logic", inIt(heard, "wakeRe()"), true);
  t("the shared handler still asks the question", inIt(heard, "hfAsk("), true);
  t("pausing stops the native microphone too", inIt(pause, "nativeMicStop()"), true);
  t("closing stops the native microphone too", inIt(close, "nativeMicStop()"), true);
}


/* ---- the on-device option is never lost ---- */
/* the phone is asked asynchronously, so the first run happens before the answer */
{
  const sync = grab("syncProviderUI");
  const inIt = (src, bit) => src.indexOf(bit) > -1;
  t("it holds on to the option after taking it out of the list", inIt(sync, "deviceOpt = od"), true);
  t("it looks in its own pocket when the page no longer has it", inIt(sync, '$("optDevice") || deviceOpt'), true);
  t("it puts the option back once the phone says yes", inIt(sync, "psel.insertBefore(od"), true);
  t("the whole app source declares the holder", src.indexOf("var deviceOpt = null;") > -1, true);
  t("opening settings asks the phone again", src.indexOf("checkDeviceModel().then(syncProviderUI)") > -1, true);
}

/* ---- asking out loud gets an answer out loud ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  t("a spoken question is sent rather than left in the box", inSrc("send(true)"), true);
  t("typing is silent - the flag is set per message, never left on",
    inSrc("speakNext = !!spoken;"), true);
  t("two seconds of quiet ends the turn", inSrc("waitForQuiet(2000)"), true);
  t("and it waits longer for the first word", inSrc("waitForQuiet(7000)"), true);
  t("the turn cannot end twice", inSrc("if(turnOver) return;"), true);
  t("he talks at a human pace", inSrc("u.rate = 1;"), true);
  t("and uses the most human voice the phone has", inSrc("function pickVoice"), true);
  t("the answer to a spoken question is read back", inSrc("(store.settings.tts || speakNext) && !aborted"), true);
  t("the flag is cleared so later answers stay quiet", inSrc("speakNext = false;"), true);
  t("it can be turned off", inSrc('bindSwitch("swVoiceTalk","voiceTalk")'), true);
  t("talking back is on unless it is turned off", inSrc("voiceTalk:true"), true);
}


/* ---- reaching the native bridge, by whichever route exists ---- */
function nativeFrom(cap, exp){
  const fn = new Function("window",
    "var nativeVia;" + grab("findNative") + "; return [findNative(), nativeVia];");
  return fn({ Capacitor: cap, capacitorExports: exp });
}
{
  const plugin = { ask(){} };
  t("finds the plugin when Capacitor lists it",
    nativeFrom({ Plugins: { PedroNative: plugin } })[0], plugin);
  t("uses capacitor.js when the list is empty",
    nativeFrom({ Plugins: {} }, { registerPlugin: n => ({ name: n }) })[0].name, "PedroNative");
  t("falls back to the bridge's own registerPlugin",
    nativeFrom({ Plugins: {}, registerPlugin: n => ({ name: n }) })[0].name, "PedroNative");
  t("last resort: calls the raw bridge directly",
    typeof nativeFrom({ nativePromise: () => Promise.resolve() })[0].startListening, "function");
  t("the raw bridge covers all four methods",
    ["available", "ask", "startListening", "stopListening"].every(m =>
      typeof nativeFrom({ nativePromise: () => Promise.resolve() })[0][m] === "function"), true);
  t("a plain browser gets nothing, and that is correct",
    nativeFrom(undefined)[0], null);
  t("an empty bridge is not mistaken for a working one",
    nativeFrom({ Plugins: {} })[0], null);
  t("it records which route worked, for the diagnostics",
    nativeFrom({ Plugins: {} }, { registerPlugin: n => ({ name: n }) })[1], "registerPlugin");
}


/* ---- the talking face ---- */
{
  const ui = grab("voiceUI");
  const inIt = (src, bit) => src.indexOf(bit) > -1;
  t("the face listens while you talk", inIt(ui, 'mode === "listen"'), true);
  t("and speaks while he answers", inIt(ui, 'mode === "speak"'), true);
  t("off hides it rather than leaving it blank", inIt(ui, "bar.hidden = true"), true);
  t("off clears both states", inIt(ui, 'classList.remove("listening", "speaking")'), true);
  t("it calls him by whatever name he has been given", inIt(ui, "aiName()"), true);

  t("talking shows the words where you type",
    src.indexOf('voiceUI("listen", text)') > -1 && src.indexOf("input.value = base + text") > -1, true);
  t("speaking aloud turns the face on", src.indexOf('voiceUI("speak"') > -1, true);
  t("finishing turns it off again", src.indexOf('if(!hf.on) voiceUI("off")') > -1, true);
  t("stopping the microphone hides it",
    grab("stopListening").indexOf('voiceUI("off")') > -1, true);
  t("the big hands-free face is not doubled up",
    src.indexOf('if(!hf.on) voiceUI("speak"') > -1, true);
}


/* ---- speech events actually reaching the app ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  t("listeners are registered once, not per turn", inSrc("function wireNativeMic"), true);
  t("and never removed out from under themselves",
    inSrc("Native.removeAllListeners()"), false);
  t("starting only swaps who they talk to", inSrc("micHandlers.text = onText"), true);
  t("stopping clears the pending callback", inSrc("micHandlers.done = null"), true);
  t("it notices when nothing is heard", inSrc("micHeardAnything"), true);
  t("and says so instead of sitting there",
    inSrc("no words reached the app"), true);
  t("it warns while the bar is still up", inSrc("not picking anything up yet"), true);
  t("hands-free warns too",
    grab("hfListenNative").indexOf("nothing is reaching the app") > -1, true);
}


/* ---- choosing a voice, and listening in the background ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const pv = grab("pickVoice");
  t("a chosen voice beats the automatic pick", pv.indexOf("store.settings.voiceName") > -1, true);
  t("the automatic pick prefers the human-sounding ones", pv.indexOf("voiceIsGood") > -1, true);
  t("one place decides what sounds human",
    grab("voiceIsGood").indexOf("siri|premium|enhanced|natural|neural") > -1, true);
  t("choosing again re-picks rather than keeping the old one",
    inSrc("chosenVoice = null;"), true);
  t("the list is built from what the phone actually has",
    grab("fillVoices").indexOf("allVoices()") > -1, true);
  t("you can hear one before choosing", inSrc("btnHearVoice"), true);

  const bg = grab("applyBackground");
  t("background listening asks the native side", bg.indexOf("Native.setBackground") > -1, true);
  t("it refuses on a web page instead of pretending", bg.indexOf("only works in the installed app") > -1, true);
  t("and turns itself back off there", bg.indexOf("store.settings.background = false") > -1, true);
  t("it keeps the screen awake while on", bg.indexOf("keepAwake(on)") > -1, true);
  t("the choice survives a restart", inSrc("applyBackground();"), true);

  const sv = grab("save");
  t("the picture just attached is never the one binned",
    sv.indexOf("j >= ms.length - 2") > -1, true);
}


/* ---- doing things on the phone ---- */
{
  const APPS = (function(){
    const i = src.indexOf("var APPS = {");
    const j = src.indexOf("};", i) + 2;
    const fn = new Function(src.slice(i, j) + "; return APPS;");
    return fn();
  })();
  const actionUrl = new Function("APPS", grab("actionUrl") + "; return actionUrl;")(APPS);
  const readActions = new Function("actionUrl", grab("readActions") + "; return readActions;")(actionUrl);

  t("it pulls one instruction out of a reply",
    readActions("Opening maps. [[maps:camden]]").actions.length, 1);
  t("and leaves the words behind",
    readActions("Opening maps. [[maps:camden]]").text, "Opening maps.");
  t("it handles several",
    readActions("[[maps:a]] and [[spotify:b]]").actions.length, 2);
  t("a reply with none is untouched",
    readActions("just talking").text, "just talking");
  t("an unknown app is ignored rather than guessed at",
    readActions("[[teleport:mars]]").actions.length, 0);
  t("an unfinished bracket does not hang it",
    readActions("[[maps:camden").actions.length, 0);

  t("maps searches", actionUrl("maps", "camden town"), "maps://?q=camden%20town");
  t("spotify searches", actionUrl("spotify", "blinding lights"), "spotify:search:blinding%20lights");
  t("a shortcut runs by name",
    actionUrl("shortcut", "Lights Off"), "shortcuts://run-shortcut?name=Lights%20Off");
  t("a phone number keeps only what can be dialled",
    actionUrl("phone", "+44 7700 900123"), "tel:+447700900123");
  t("the web falls back to a search",
    actionUrl("web", "tide times").indexOf("duckduckgo") > -1, true);
  t("a real address is opened as it is",
    actionUrl("web", "https://bbc.co.uk"), "https://bbc.co.uk");
  t("something it cannot do returns nothing", actionUrl("launch", "rocket"), null);

  const run = grab("runActions");
  t("it goes through the native side", run.indexOf("Native.openURL") > -1, true);
  t("and says so on a web page instead of failing quietly",
    run.indexOf("only works in the installed app") > -1, true);
  t("a missing app is explained", run.indexOf("may not be installed") > -1, true);
}


/* ---- asking a question out loud ---- */
{
  const heard = grab("hfHeardText");
  const settle = grab("hfSettle");
  const inIt = (src, bit) => src.indexOf(bit) > -1;

  t("a pause is what sends the question", inIt(heard, "hfSettle(live)"), true);
  t("it no longer waits for a final marker that never comes",
    inIt(heard, "if(finalTxt.trim()){ clearTimeout(hf.settle); hfAsk(finalTxt.trim()); return; }"), true);
  t("a question in one breath is sent too", inIt(heard, "hfSettle(after)"), true);
  t("the wake word alone still just answers", inIt(heard, "Yeah?"), true);

  t("the pause actually asks", inIt(settle, "hfAsk(q)"), true);
  t("it only fires while still listening", inIt(settle, 'hf.phase !== "hear"'), true);
  t("anything new resets it", inIt(settle, "clearTimeout(hf.settle)"), true);
  t("pausing the mic disarms it", inIt(grab("hfPause"), "clearTimeout(hf.settle)"), true);
  t("closing disarms it", inIt(grab("hfClose"), "clearTimeout(hf.settle)"), true);
}


/* ---- acting on what was actually said ---- */
/* "open safari" got a cheerful "sure thing" and nothing else, because Safari
   was not in the list and the whole thing relied on the model remembering to
   emit a marker. Neither is true any more. */
{
  function chunk(a, b){
    const i = src.indexOf(a), j = src.indexOf(b, i) + b.length;
    return src.slice(i, j);
  }
  const code = [
    chunk("var APPS = {", "};"),
    chunk("var APP_ALIASES = {", "};"),
    grab("appNamed"), grab("actionUrl"),
    chunk("var INTENTS = [", "];"), grab("intentFrom")
  ].join("\n");
  const intentFrom = new Function(code + "; return intentFrom;")();
  const kindOf = t => { const r = intentFrom(t); return r ? r.kind : null; };

  t("open safari does something", kindOf("open safari"), "web");
  t("his name in front is ignored", kindOf("Pedro, open safari"), "web");
  t("open up works as well as open", kindOf("open up safari"), "web");
  t("a real app opens itself", kindOf("open spotify"), "spotify");
  t("the definite article is fine", kindOf("open the camera"), "camera");
  t("play goes to music", kindOf("play blinding lights"), "spotify");
  t("play on youtube goes there", kindOf("play blinding lights on youtube"), "youtube");
  t("take me to gives directions", kindOf("take me to camden town"), "directions");
  t("search goes to the web", kindOf("search for tide times"), "web");
  t("a shortcut by name", kindOf("run my lights off shortcut"), "shortcut");
  t("and the other way round", kindOf("run shortcut Goodnight"), "shortcut");

  t("a question is not an instruction", kindOf("what is the capital of france"), null);
  t("small talk is not an instruction", kindOf("how are you today"), null);
  t("nothing at all is safe", kindOf(""), null);

  t("the browser opens on its own with no search", intentFrom("open safari").url.indexOf("google.com") > -1, true);
  t("a search still searches", intentFrom("search for tide times").url.indexOf("q=tide") > -1, true);

  t("the reply doing nothing falls back to what was said",
    src.indexOf("var meant = intentFrom(lastUserText);") > -1, true);
}


/* ---- looking at things ---- */
{
  const line = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const camBits = new Function(line("CAM_RE") + line("CAM_ONLY_RE") + grab("camQuestion") +
    "; return { CAM_RE:CAM_RE, camQuestion:camQuestion };")();
  const looks = q => camBits.CAM_RE.test(q);
  const inSrc = bit => src.indexOf(bit) > -1;

  t("counting goes to the camera", looks("count the boxes"), true);
  t("how many goes to the camera", looks("how many boxes are there"), true);
  t("what is this goes to the camera", looks("what is this"), true);
  t("so does asking it to look", looks("look at this"), true);
  t("and just saying camera", looks("open the camera"), true);
  t("a general question does not", looks("what is the capital of france"), false);
  t("nor does small talk", looks("how are you"), false);

  t("counting is asked for carefully",
    /one by one/.test(camBits.camQuestion("count the boxes")), true);
  t("and it is told to admit what it cannot see",
    /rather than guessing/.test(camBits.camQuestion("count the boxes")), true);
  t("a plain look needs no extra wording",
    camBits.camQuestion("what is this"), "what is this");
  t("asking for the camera alone becomes a real question",
    camBits.camQuestion("camera"), "What am I looking at?");

  const grabFrame = grab("camGrab");
  t("the picture is taken at the moment of asking", inSrc("var shot = camGrab();"), true);
  t("it is shrunk before sending", grabFrame.indexOf("1024 / Math.max") > -1, true);
  t("the front camera is unmirrored", grab("camStart").indexOf("scaleX(-1)") > -1, true);
  t("flipping swaps which camera", grab("camFlip").indexOf("environment") > -1, true);
  t("closing lets go of the camera", grab("camClose").indexOf("camStop()") > -1, true);
  t("stopping actually stops the tracks", grab("camStop").indexOf("t.stop()") > -1, true);
  t("questions go to the camera while it is open", inSrc("if(cam.open){ camAsk(question); return; }"), true);
  t("the answer is spoken", grab("camAsk").indexOf("speak(answer)") > -1, true);
}


/* ---- being heard ---- */
{
  const sp = grab("speak");
  const inSrc = bit => src.indexOf(bit) > -1;
  t("it lets go of the microphone before speaking",
    sp.indexOf("if(nativeListening) nativeMicStop();") > -1, true);
  t("the microphone release comes before the speaking",
    sp.indexOf("nativeMicStop") < sp.indexOf("speechSynthesis.speak"), true);
  t("volume is applied to what he says", sp.indexOf("u.volume") > -1, true);
  t("a broken volume setting still speaks", sp.indexOf("isNaN(vol) ? 1") > -1, true);
  t("volume is clamped to something sane", sp.indexOf("Math.max(0, Math.min(1, vol))") > -1, true);
  t("there is a control for it", inSrc('$("setVolume")'), true);
  t("it starts at full", inSrc("volume:1,"), true);
  t("and travels to a new install", inSrc("volume:s.volume"), true);
}


/* ---- how he sounds, and answering from behind ---- */
{
  const sp = grab("speak");
  const inSrc = bit => src.indexOf(bit) > -1;
  t("speed has a ceiling so it cannot gabble",
    sp.indexOf("Math.max(0.7, Math.min(1.3, rate))") > -1, true);
  t("a broken speed setting still speaks", sp.indexOf("isNaN(rate) ? 1") > -1, true);
  t("there is a control for speed", inSrc('$("setRate")'), true);
  t("speed travels to a new install", inSrc("rate:s.rate"), true);

  const quiet = grab("hfListenQuietly");
  t("it can listen with nothing on screen", quiet.indexOf("hf.want = true") > -1, true);
  t("and deliberately does not show its screen",
    quiet.indexOf('hfEl.classList.remove("on")') > -1, true);
  t("it still listens for the name", quiet.indexOf("hfListen()") > -1, true);
  const bg = grab("applyBackground");
  t("turning it on starts listening", bg.indexOf("hfListenQuietly()") > -1, true);
  t("turning it off stops listening", bg.indexOf("hf.want = false") > -1, true);
  t("turning it off leaves the voice screen alone",
    bg.indexOf('!hfEl.classList.contains("on")') > -1, true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " mic/image tests passed");
process.exit(fail ? 1 : 0);
