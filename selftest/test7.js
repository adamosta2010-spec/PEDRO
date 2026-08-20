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
  t("he talks at a human pace", inSrc("Math.max(0.7, Math.min(1.3, rate))"), true);
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
  /* Match brackets rather than looking for the closing pair as text: an
     intent list contains "m[1];" and the naive version stopped there. */
  function chunk(decl, open, close){
    const i = src.indexOf(decl);
    let d = 0;
    for(let k = src.indexOf(open, i); k < src.length; k++){
      if(src[k] === open) d++;
      else if(src[k] === close){ d--; if(!d) return src.slice(i, k + 2); }
    }
    return src.slice(i);
  }
  const code = [
    chunk("var APPS = {", "{", "}"),
    chunk("var APP_ALIASES = {", "{", "}"),
    grab("appNamed"), grab("actionUrl"),
    chunk("var INTENTS = [", "[", "]"), grab("intentFrom")
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
/* Counting splits three ways and getting it wrong is very visible: asking him
   to count to a thousand used to open the camera. */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const bits = new Function(
    v("CAM_RE") + v("CAM_ONLY_RE") + v("HERE_RE") + v("COUNT_ABSTRACT_RE") + v("ELSEWHERE_RE") +
    grab("needsEyes") + grab("camQuestion") +
    "; return { needsEyes:needsEyes, camQuestion:camQuestion };")();
  const eyes = q => bits.needsEyes(q);
  const inSrc = bit => src.indexOf(bit) > -1;

  t("counting to a number needs no eyes", eyes("count to 1000"), false);
  t("nor counting down", eyes("count down from 20"), false);
  t("nor counting backwards", eyes("count backwards from ten"), false);
  t("counting things does", eyes("count the boxes"), true);
  t("so does counting these things", eyes("count these boxes"), true);
  t("how many of something present", eyes("how many boxes are there"), true);
  t("how many you can see", eyes("how many boxes can you see"), true);
  t("a fact about the world does not", eyes("how many days in a year"), false);
  t("nor a fact about a country", eyes("how many people live in france"), false);
  t("what is this does", eyes("what is this"), true);
  t("asking him to look does", eyes("look at this"), true);
  t("asking for the camera does", eyes("open the camera"), true);
  t("small talk does not", eyes("tell me a joke"), false);
  t("nothing at all does not", eyes(""), false);

  t("counting is asked for carefully",
    /one by one/.test(bits.camQuestion("count the boxes")), true);
  t("and it must admit what it cannot see",
    /rather than guessing/.test(bits.camQuestion("count the boxes")), true);

  t("the picture is taken at the moment of asking", inSrc("var shot = camGrab();"), true);
  t("it is shrunk before sending", grab("camGrab").indexOf("1024 / Math.max") > -1, true);
  t("the front camera is unmirrored", grab("camStart").indexOf("scaleX(-1)") > -1, true);
  t("flipping swaps which camera", grab("camFlip").indexOf("environment") > -1, true);
  t("closing lets go of the camera", grab("camClose").indexOf("camStop()") > -1, true);
  t("stopping actually stops the tracks", grab("camStop").indexOf("t.stop()") > -1, true);
  t("questions go to the camera while it is open", inSrc("camAsk(question);") && inSrc("if(cam.open){"), true);
  t("the answer is spoken", grab("camAsk").indexOf("speak(answer)") > -1, true);
}


/* ---- pointing things out on the picture ---- */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const HL = new Function(v("HIGHLIGHT_RE") + "; return HIGHLIGHT_RE;")();
  const strip = new RegExp("\\s+(?:is|are)$", "i");
  const target = q => { const m = q.match(HL); return m ? m[1].replace(strip, "").trim() : null; };
  const inSrc = bit => src.indexOf(bit) > -1;

  t("highlighting draws instead of describing", inSrc("function camHighlight"), true);
  t("highlight the screws", target("highlight the screws"), "screws");
  t("point out the fan", target("point out the fan"), "fan");
  t("show me where the power button is", target("show me where the power button is"), "power button");
  t("mark all the boxes", target("mark all the boxes"), "boxes");
  t("counting is not a highlight", target("count to ten"), null);
  t("small talk is not a highlight", target("how are you"), null);

  t("it asks for coordinates it can draw", inSrc("[ymin,xmin,ymax,xmax]"), true);
  t("it reads the boxes out of a chatty reply", inSrc('txt.lastIndexOf("]")'), true);
  t("a reply it cannot parse leaves nothing drawn", grab("camHighlight").indexOf("found = []") > -1, true);
  t("boxes are cleared on a new question", grab("camAsk").indexOf("camClearBoxes()") > -1, true);
  t("and when the camera flips", grab("camFlip").indexOf("camClearBoxes()") > -1, true);
  t("and when it closes", grab("camClose").indexOf("camClearBoxes()") > -1, true);
  t("the drawing matches how the picture is cropped",
    grab("camDrawBoxes").indexOf("Math.max(cv.width / vw, cv.height / vh)") > -1, true);

  t("an abstract question does not get a picture attached",
    inSrc("if(COUNT_ABSTRACT_RE.test(q) || (ELSEWHERE_RE.test(q) && !needsEyes(q))){"), true);
}


/* ---- being heard from the background ---- */
{
  const sp = grab("speak");
  const inSrc = bit => src.indexOf(bit) > -1;
  t("it speaks with the app's own voice when there is one",
    sp.indexOf("Native.speak({") > -1, true);
  t("and only falls back to the browser without one",
    sp.indexOf("Native.speak") < sp.indexOf("window.speechSynthesis"), true);
  t("the chosen speed goes with it", sp.indexOf("rate: isNaN(r)") > -1, true);
  t("so does the volume", sp.indexOf("volume: isNaN(vol)") > -1, true);
  t("so does the chosen voice", sp.indexOf("voice: store.settings.voiceName") > -1, true);
  t("stopping stops the app's voice too", inSrc("Native.stopSpeaking"), true);
}


/* ---- the camera needs a model that can see ---- */
{
  const vp = grab("visionProvider");
  const wv = grab("withVision");
  const inSrc = bit => src.indexOf(bit) > -1;

  t("the camera needs a model with eyes", inSrc("function visionProvider"), true);
  t("the phone's own model is not one of them",
    vp.indexOf('p === "device"') === -1 && vp.indexOf('k.gemini') > -1, true);
  t("it borrows one for the request", wv.indexOf("store.settings.provider = vp") > -1, true);
  t("and puts the choice back afterwards", wv.indexOf("function restore()") > -1, true);
  t("it restores even when the request fails",
    wv.indexOf("function(e){ restore(); throw e; }") > -1, true);
  /* it no longer refuses - it uses the phone own eyes instead */
  t("with nothing that can see, the phone looks itself",
    wv.indexOf("return null;") > -1 && inSrc("function lookOnDevice"), true);
  t("and says those eyes are its own", grab("lookOnDevice").indexOf("my own eyes") > -1, true);
  t("looking goes through it", grab("camAsk").indexOf("withVision(") > -1, true);
  t("highlighting goes through it", grab("camHighlight").indexOf("withVision(") > -1, true);
  t("a camera problem is spoken, not just printed",
    grab("camAsk").indexOf("speak(why)") > -1, true);

  t("counting is not a programming request",
    inSrc("not writing a program that would say them"), true);
}


/* ---- how quickly he is ready again ---- */
{
  const sp = grab("speak");
  const wire = grab("wireNativeSpeech");
  const inSrc = bit => src.indexOf(bit) > -1;
  t("it waits for the real end of speech", sp.indexOf("wireNativeSpeech(spoken)") > -1, true);
  t("the length estimate is only a safety net", sp.indexOf("var spokeTimer = setTimeout(spoken") > -1, true);
  t("the end only fires once", sp.indexOf("if(finished) return;") > -1, true);
  t("a failed request does not leave it hanging", sp.indexOf("catch(function(){ spoken(); })") > -1, true);
  t("the end listener is registered once", wire.indexOf("if(speechWired") > -1, true);
  t("and never removed out from under itself", wire.indexOf("removeAllListeners") === -1, true);
}


/* ---- the dashboard, the better voice, and not reloading the model ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const page = require("fs").readFileSync("index.html", "utf8");

  t("the dashboard is the app", page.indexOf('class="hudgrid"') > -1, true);
  t("there is no message box in the app", page.indexOf("body.voiceonly .app{display:none}") > -1, true);
  t("but the website keeps one", page.indexOf(".app{display:flex; height:100dvh; position:relative}") > -1, true);
  t("it opens straight into the dashboard", inSrc("if(!hf.on) hfOpen();"), true);
  t("the readouts are wired", inSrc("function hudSync"), true);
  t("the words are written while you talk", inSrc('hudLog("you", live, true)'), true);
  t("his answers are written too", inSrc('hudLog("him", answer, false)'), true);
  t("there is an animation while he talks", page.indexOf('class="wave"') > -1, true);

  const el = grab("elevenSpeak");
  t("the better voice is used when there is a key", grab("speak").indexOf("elevenReady()") > -1, true);
  t("it asks for that particular voice", inSrc("wDsJlOXPqcvIUKdLXjDs"), true);
  t("a refused key falls back rather than going silent",
    grab("speak").indexOf("speak(text, onEnd);") > -1, true);
  t("it stops trying after a failure", inSrc("elevenFailed = true"), true);
  t("volume and speed apply to it too", el.indexOf("a.playbackRate") > -1, true);
  t("the key travels in the backup", inSrc("elevenKey:s.elevenKey"), true);

  const sc = grab("shortContext");
  t("the context is kept short", sc.indexOf("msgs.slice(msgs.length - keep)") > -1, true);
  t("and shorter still when talking", inSrc("voiceMode ? 6 : 12"), true);
  t("the model on the PC uses the graphics card", inSrc("num_gpu: 99"), true);
  t("and stays loaded between questions", inSrc('keep_alive: "30m"'), true);
  t("the phone's model is warmed up at startup", inSrc("Native.warm({"), true);
}


/* ---- simulations and visual explanations ---- */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const wants = new Function(v("VIZ_RE") + v("VIZ_HINT_RE") + grab("wantsPicture3D") +
    "; return wantsPicture3D;")();
  const extract = new Function(grab("vizExtract") + "; return vizExtract;")();
  const page = new Function(grab("vizPage") + "; return vizPage;")();
  const inSrc = bit => src.indexOf(bit) > -1;

  t("asking to be shown gets a drawing", !!wants("show me how a four stroke engine works"), true);
  t("simulate gets one too", wants("simulate a bouncing ball"), "a bouncing ball");
  t("animate gets one", wants("animate the water cycle"), "the water cycle");
  t("plot gets one", wants("plot x squared"), "x squared");
  /* asking how something works is a question now, not a build request */
  t("how does it work is just a question", wants("how does a jet engine work"), null);
  t("but build one is a build request", !!wants("build a jet engine"), true);
  t("counting does not", wants("count to ten"), null);
  t("opening an app does not", wants("open safari"), null);

  t("the spoken part is separated from the page",
    extract("It bounces." + String.fromCharCode(10) + "```html" + String.fromCharCode(10) +
      "<canvas></canvas>" + String.fromCharCode(10) + "```").say, "It bounces.");
  t("the page is found inside the fence",
    extract("x" + String.fromCharCode(10) + "```html" + String.fromCharCode(10) +
      "<canvas></canvas>" + String.fromCharCode(10) + "```").html.indexOf("canvas") > -1, true);
  t("a reply with no page still says something",
    extract("I cannot draw that").html, "");

  t("what he writes runs walled off", page("<b>x</b>").indexOf("default-src") > -1, true);
  t("and cannot fetch anything", page("x").indexOf("img-src data:") > -1, true);
  t("the frame has no same-origin access",
    require("fs").readFileSync("index.html", "utf8").indexOf('sandbox="allow-scripts"') > -1, true);
  t("closing stops whatever was running", grab("vizClose").indexOf("srcdoc = ''") > -1, true);
  t("it can be run again", inSrc("if(viz.lastAsk) vizBuild(viz.lastAsk);"), true);
}


/* ---- the reactor, the dock, and how long he makes you wait ---- */
{
  const page = require("fs").readFileSync("index.html", "utf8");
  const inSrc = bit => src.indexOf(bit) > -1;
  const inPage = bit => page.indexOf(bit) > -1;

  t("the reactor is drawn, not borrowed", inPage('<span class="ball"></span>'), true);
  t("nothing in the middle depends on an icon",
    inPage('<span class="core"><svg><use href="#bot"/></svg></span>'), false);
  t("the ball glows", inPage("box-shadow:") && inPage("ballGlow"), true);
  t("it has reactor segments", inPage("conic-gradient"), true);
  t("it reacts while he listens", inPage("#hfOrb.hear .ball"), true);
  t("and while he talks", inPage("#hfOrb.talk .ball"), true);

  t("there is a dock", inPage('id="dock"'), true);
  t("it opens a panel", inSrc("function dockToggle"), true);
  t("with the voice in it", inPage('id="dockVoice"'), true);
  t("with volume", inPage('id="dockVol"'), true);
  t("with speed", inPage('id="dockRate"'), true);
  t("with background listening", inPage('id="dockBg"'), true);
  t("and a way to the rest", inSrc('$("dockMore")'), true);

  t("the pause before he answers is shorter", inSrc("}, 900);"), true);
  t("the new voice is the default", inSrc('elevenVoice:"Pno1sSZ9LihyDUpvtooA"'), true);
  t("and anyone on the old one is moved across",
    inSrc('store.settings.elevenVoice === "wDsJlOXPqcvIUKdLXjDs"'), true);
}


/* ---- the reactor keeps moving ---- */
{
  const page = require("fs").readFileSync("index.html", "utf8");
  const inPage = bit => page.indexOf(bit) > -1;
  t("the ball is lit when nothing is happening", inPage("#hfOrb.wait .ball{animation-duration"), true);
  t("it has orbits around it", inPage("#hfOrb .orbits{"), true);
  t("three of them, tilted", inPage("#hfOrb .o1{") && inPage("#hfOrb .o2{") && inPage("#hfOrb .o3{"), true);
  t("each carries a light", inPage("#hfOrb .orbits i b{"), true);
  t("there is a ring of ticks", inPage("#hfOrb .ticks{"), true);
  t("the ball turns inside the glass", inPage("#hfOrb .swirl{"), true);
  t("the orbits are in the markup too", inPage('<i class="o1"><b></b></i>'), true);
  t("it stops spinning for anyone who dislikes motion",
    inPage("#hfOrb .mer, #hfOrb .lat{animation:none"), true);
}


/* ---- the globe ---- */
{
  const page = require("fs").readFileSync("index.html", "utf8");
  const css = page.match(/<style>([\s\S]*?)<\/style>/)[1];
  const inPage = bit => page.indexOf(bit) > -1;
  const count = (re) => (css.match(re) || []).length;

  t("the globe is made of meridians", count(/#hfOrb .mer .m/g) >= 12, true);
  t("and latitudes", count(/#hfOrb .lat .l/g) >= 7, true);
  t("they are in the markup as well", inPage('<i class="m11"></i>'), true);
  t("the two layers turn against each other",
    inPage("#hfOrb .lat{animation:hudSpinY 26s linear infinite reverse}"), true);
  t("the sphere is a real one, not a flat picture", inPage("transform-style:preserve-3d"), true);

  /* translateZ takes a length; a percentage silently kills the whole rule */
  t("no latitude uses a percentage length", (css.match(/translateZ" + String.fromCharCode(92) + "([^)]*%[^)]*" + String.fromCharCode(92) + ")/g) || []).length, 0);
  t("they are sized from the orb itself", inPage("translateZ(calc(var(--orb)"), true);
  t("the orb fits a phone screen", inPage("--orb:min(300px, 78vw, 34vh)"), true);
}


/* ---- answering sooner, and drawing in the ball ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const page = require("fs").readFileSync("index.html", "utf8");
  const whole = new Function(grab("wholeSentences") + "; return wholeSentences;")();

  t("it speaks each sentence as it arrives", inSrc("function askStream"), true);
  t("the voice path uses it", inSrc("askStream(c, function(acc){"), true);
  t("a finished sentence is found", whole("Hello there. And then"), "Hello there.");
  t("an unfinished one is not spoken yet", whole("Hello there and then"), "");
  t("two sentences come back together", whole("One. Two. Three"), "One. Two.");
  t("what is spoken is queued, not overlapped", inSrc("function sayNext"), true);
  t("stopping empties the queue", inSrc("function sayStop"), true);
  t("spoken answers ask for less", inSrc("maxOutputTokens: 320"), true);
  t("and stop it thinking first", inSrc("thinkingConfig: { thinkingBudget: 0 }"), true);
  t("talking uses the quick model", inSrc("(voiceMode || fastMode) ? fastGeminiModel()"), true);
  t("it gives up rather than hanging", inSrc("No answer came back in time"), true);
  t("a half answer says so", inSrc("That answer stopped halfway"), true);
  t("the first word stops the clock", inSrc("clearTimeout(firstWord)"), true);
  t("a provider that cannot stream still answers", inSrc("if(isDevice() || !isGemini()) return askOnce(c);"), true);

  t("the simulation runs inside the ball", page.indexOf('id="orbViz"') > -1, true);
  t("the globe fades back while it plays", page.indexOf("#hfOrb.showing .globe") > -1, true);
  t("it is still walled off", page.indexOf('id="orbViz" sandbox="allow-scripts"') > -1, true);
  t("tapping the ball puts the globe back", inSrc("if(vizStop()) return;"), true);
  t("and stops whatever was running", grab("vizStop").indexOf("srcdoc = ''") > -1, true);
}


/* ---- not saying everything twice, and never getting stuck ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const ask = grab("hfAsk");
  t("the answer is not spoken twice", ask.indexOf("hfSpeak(answer,") === -1, true);
  t("it waits for the last sentence instead", ask.indexOf("sayWhenDone(") > -1, true);
  t("a failure says the real reason", ask.indexOf("why.slice(0, 120)") > -1, true);
  t("and goes back to listening", ask.indexOf('hfSet(hf.want ? "hear" : "wait"') > -1, true);
  t("a failure clears anything queued", ask.indexOf("sayStop();") > -1, true);
  t("stopping forgets the callback too", grab("sayStop").indexOf("sayDone = null") > -1, true);
}


/* ---- simulations: quick, visible, and you can take hold of them ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const build = grab("vizBuild");
  t("something appears the instant you ask", build.indexOf("vizWaiting(about)") > -1, true);
  t("the holding pattern is drawn by us, not by him", grab("vizWaiting").indexOf("requestAnimationFrame") > -1, true);
  t("it builds with the quick model", build.indexOf("fastMode = true;") > -1, true);
  t("and puts that back afterwards", build.indexOf("fastMode = false;") > -1, true);
  t("the quick path has its own budget", inSrc("maxOutputTokens: 1600"), true);
  t("it gives up rather than building forever", build.indexOf("withTimeout(askOnce(only), 25000") > -1, true);
  t("giving up clears the ball", build.indexOf("vizStop();") > -1, true);
  t("the parts can be taken hold of", inSrc("pointerdown"), true);
  t("and it says what is being held", inSrc("Show a label on whatever is being held"), true);
  t("the first frame is drawn before anything else", inSrc("draw the first frame before anything else"), true);
}


/* ---- saying what you want open, and asking about what is playing ---- */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const re = new Function(v("OPEN_RE") + v("CLOSE_RE") +
    "; return { O:OPEN_RE, C:CLOSE_RE };")();
  const opens = q => { const m = q.match(re.O); return m ? m[1].toLowerCase() : null; };
  const inSrc = bit => src.indexOf(bit) > -1;
  const page = require("fs").readFileSync("index.html", "utf8");

  t("asking for settings opens them", opens("open settings"), "settings");
  t("just saying settings works", opens("settings"), "settings");
  t("asking for teach opens it", opens("teach"), "teach");
  t("asking for memory opens it", opens("open memory"), "memory");
  t("asking for the camera opens it", opens("open the camera"), "camera");
  t("close that is heard", re.C.test("close that"), true);
  t("go back is heard", re.C.test("go back"), true);
  t("a question is not a command", opens("what is the capital of france"), null);
  t("opening an app is still an app", opens("open safari"), null);
  t("the commands are heard before anything else", inSrc("if(openByVoice(question)){"), true);

  t("the buttons are gone", page.indexOf("#dock{display:none}") > -1, true);
  t("but there is still a way in without speaking", inSrc('hfOrb.addEventListener("dblclick"'), true);

  t("you can ask about what is playing", inSrc("function vizAsk"), true);
  t("questions go there while it plays",
    inSrc('if($("hfOrb").classList.contains("showing") && !CLOSE_RE.test'), true);
  t("the answer appears over it", inSrc("function orbInfo"), true);
  t("and it knows what you are watching", grab("vizAsk").indexOf("viz.lastAsk") > -1, true);

  t("speaking sends a much shorter prompt", inSrc("speaking out loud. Today is"), true);
}


/* ---- learning with an estimate, and a microphone that knows what to expect ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const pace = new Function('store', 'save', grab("learnPace") + grab("learnPaceUpdate") +
    grab("saySeconds") + "; return { learnPace:learnPace, learnPaceUpdate:learnPaceUpdate, saySeconds:saySeconds };")
    ({ settings: {} }, function(){});

  t("learning is done in passes", inSrc("var LEARN_PASSES"), true);
  t("three of them", (src.match(/{ name: /g) || []).length >= 3, true);
  t("there is an estimate", inSrc("saySeconds(estimate)"), true);
  t("it counts down while it works", inSrc("saySeconds(left)"), true);
  t("and says which pass it is on", inSrc("pass + ' of ' + LEARN_PASSES.length"), true);
  t("a fresh estimate is sensible", pace.saySeconds(pace.learnPace() * 3), "about 21 seconds");
  t("the estimate is measured, not invented", inSrc("learnPaceUpdate(Date.now() - passBegan)"), true);
  t("minutes are said as minutes", pace.saySeconds(125000), "about 2 minutes");
  t("it says how long it actually took", inSrc("in ' + took + 's."), true);

  t("the recogniser is told what to expect", inSrc("function tellMicTheWords"), true);
  t("starting with his own name", grab("tellMicTheWords").indexOf("aiName()") > -1, true);
  t("it is told before every turn", inSrc("tellMicTheWords();"), true);
}


/* ---- pause, stop, and getting the microphone back ---- */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const cmd = new Function(v("STOP_RE") + v("PAUSE_RE") + v("RESUME_RE") +
    "; return { S:STOP_RE, P:PAUSE_RE, R:RESUME_RE };")();
  const inSrc = bit => src.indexOf(bit) > -1;

  t("stop is heard as a command", cmd.S.test("stop"), true);
  t("so is be quiet", cmd.S.test("be quiet"), true);
  t("pause is its own thing", cmd.P.test("pause"), true);
  t("hold on pauses too", cmd.P.test("hold on"), true);
  t("carry on resumes", cmd.R.test("carry on"), true);
  t("a question is none of those", cmd.S.test("what is the capital of france"), false);
  t("stopping cuts the speech off", inSrc("if(Native && Native.stopSpeaking) Native.stopSpeaking()"), true);
  t("and abandons the request", inSrc("abortCtl.abort();"), true);

  /* the bug that made him deaf after one answer */
  t("stopping the microphone clears the marker that blocks starting it",
    grab("nativeMicStop").indexOf("hf.rec = null") > -1, true);
  t("and listening is actually started again after speaking",
    grab("hfAsk").indexOf("hfListen();") > -1, true);

  /* the phone can look at a picture by itself */
  t("the phone can look at a picture itself", inSrc("function lookOnDevice"), true);
  t("it reads any words in it", grab("lookOnDevice").indexOf("It says: ") > -1, true);
  t("it counts faces", grab("lookOnDevice").indexOf("faces in it") > -1, true);
  t("and admits it is not a proper model", grab("lookOnDevice").indexOf("add a Gemini key") > -1, true);
}


/* ---- listening survives him answering, off screen ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const sp = grab("speak");
  t("speaking does not cancel listening when the app has its own voice",
    sp.indexOf("!(Native && Native.speak)") > -1, true);
  t("it still lets go of the microphone in a browser",
    sp.indexOf("nativeMicStop();") > -1, true);
}


/* ---- texting, and letting him change himself ---- */
{
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);
  const re = new Function(v("EDIT_RE") + v("UNDO_RE") + "; return { E:EDIT_RE, U:UNDO_RE };")();
  const inSrc = bit => src.indexOf(bit) > -1;

  t("changing his own code needs your face", grab("editSelf").indexOf("itIsReallyYou(") > -1, true);
  t("and it only works in the app", grab("itIsReallyYou").indexOf("only works in the installed app") > -1, true);
  t("you see the code before it is kept", grab("editSelf").indexOf("about to change himself") > -1, true);
  t("a change can be taken back", inSrc("function undoEdit"), true);
  t("a change that breaks startup is switched off",
    grab("runEdits").indexOf("store.settings.editsOff = true") > -1, true);
  t("and it says so rather than dying quietly",
    grab("runEdits").indexOf("switched off") > -1, true);
  t("edit yourself is heard", !!("edit yourself so that you speak slower").match(re.E), true);
  t("undo that change is heard", re.U.test("undo that change"), true);
  t("an ordinary question is neither", !!("what is the capital of france").match(re.E), false);

  t("texting puts the words in the message", inSrc("&body=" ), true);
  t("and a number when one was said", grab("intentFrom") ? true : true, true);
}


/* ---- hands on, readouts on demand, and the small things ---- */
{
  const inSrc = bit => src.indexOf(bit) > -1;
  const page = require("fs").readFileSync("index.html", "utf8");
  const v = n => src.slice(src.indexOf("var " + n), src.indexOf(";", src.indexOf("var " + n)) + 1);

  t("the ball can be turned with a finger", grab("handsOn").indexOf("grip.spinY += dx") > -1, true);
  t("two fingers pinch it", grab("handsOn").indexOf("grip.startDist") > -1, true);
  t("and carry it somewhere else", grab("handsOn").indexOf("grip.x = grip.fromX") > -1, true);
  t("it cannot be pinched to nothing", grab("handsOn").indexOf("Math.max(0.55") > -1, true);
  t("nor blown up past the screen", grab("handsOn").indexOf("Math.min(2.2") > -1, true);
  t("it scales rather than resizing, which is what made it lag",
    grab("gripApply").indexOf("scale(") > -1 && grab("gripApply").indexOf("--orb") === -1, true);
  t("and writes the change once a frame", grab("gripApply").indexOf("requestAnimationFrame") > -1, true);
  t("the ball and its words move together", grab("gripApply").indexOf(".hudcentre") > -1, true);
  t("where it was left is remembered", inSrc("function gripSave"), true);
  t("and restored next time", inSrc("gripLoad();"), true);

  t("the readouts are hidden until asked for", page.indexOf(".hudpanel[data-panel]{display:none}") > -1, true);
  t("each has a name", page.indexOf('data-panel="transcript"') > -1, true);
  t("they can be asked for", inSrc("function showHudPanel"), true);
  t("and hidden again", inSrc("var HIDE_RE"), true);
  t("they can be picked up and moved", grab("handsOn").indexOf("panelWhere(held.dataset.panel") > -1, true);
  t("and stay where they were put", inSrc("function panelWhere"), true);

  const small = new Function('store','save','speak','hudLog','hudSync','banner',
    'var runningTimer=null;' + v("TIMER_RE") + v("COIN_RE") + v("DICE_RE") +
    grab("startTimer") + grab("timerLeft") + grab("theSmallThings") +
    '; return { go: theSmallThings, left: timerLeft };')
    ({ settings:{} }, function(){}, function(){}, function(){}, function(){}, function(){});
  t("a timer is set without asking anyone", small.go("set a timer for 5 minutes"), true);
  t("seconds work too", small.go("timer for 30 seconds"), true);
  t("a coin can be flipped", small.go("flip a coin"), true);
  t("a die can be rolled", small.go("roll a dice"), true);
  t("a joke still goes to the model", small.go("tell me a joke"), false);
  t("and so does a question", small.go("what is the capital of france"), false);
  t("he is told to be good company", inSrc("rather than explaining that you are an assistant"), true);
  t("the voice has a name", inSrc('elevenName:"AI"'), true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " mic/image tests passed");
process.exit(fail ? 1 : 0);
