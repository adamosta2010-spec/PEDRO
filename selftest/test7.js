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
  t("a spoken question is sent rather than left in the box", inSrc("speakNext = true;"), true);
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

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " mic/image tests passed");
process.exit(fail ? 1 : 0);
