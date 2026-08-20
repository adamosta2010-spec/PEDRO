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

/* ---- mic error wording ---- */
/* micError branches on platform, so test both */
let isiOS = false;
/* not running inside the iOS app during tests */
const nativeMicSupported = () => false;
/* micError also checks the page protocol now */
global.location = { protocol: "https:" };
eval(grab("micError"));
const micErrorOnHttp = code => { location.protocol = "http:"; const r = micError(code); location.protocol = "https:"; return r; };
const micErrorOn = (ios, code) => { isiOS = ios; const r = micError(code); isiOS = false; return r; };
t("desktop: blocked permission points at the padlock",
  /padlock/i.test(micErrorOn(false,"not-allowed")) && /reload/i.test(micErrorOn(false,"not-allowed")), true);
t("iPhone: no padlock advice - points at the keyboard instead",
  /padlock/i.test(micErrorOn(true,"not-allowed")) === false &&
  /keyboard/i.test(micErrorOn(true,"not-allowed")), true);
t("iPhone advice says access being allowed is not the problem",
  /even with microphone access allowed/i.test(micErrorOn(true,"service-not-allowed")), true);
t("service-not-allowed handled too", micError("service-not-allowed"), micError("not-allowed"));
t("no microphone hardware is its own message", /No microphone found/i.test(micError("audio-capture")), true);
t("silence is explained", /speak up/i.test(micError("no-speech")), true);
t("network failure is explained", /connection/i.test(micError("network")), true);
t("stopping it yourself says nothing", micError("aborted"), "");
t("unknown codes still name the code", micError("weird-thing").includes("weird-thing"), true);
t("every code returns a string",
  ["not-allowed","audio-capture","no-speech","network","aborted","x"].every(c => typeof micError(c) === "string"), true);

/* ---- micProblem across environments ---- */
function micProblemIn(env){
  global.window = { isSecureContext: env.secure };
  global.isSecureContext = env.secure;
  global.location = { hostname: env.host };
  global.navigator = { userAgent: env.ua, platform: env.platform || "Win32", maxTouchPoints: env.touch || 0 };
  global.SR = env.hasSR ? function(){} : undefined;
  global.isiOS = /iPad|iPhone|iPod/.test(env.ua);
  const fn = new Function("SR", "isiOS", "window", "location", "navigator", "nativeMicSupported",
    grab("micProblem") + "; return micProblem();");
  return fn(global.SR, global.isiOS, global.window, global.location, global.navigator, () => false);
}
const CHROME = "Mozilla/5.0 (Windows NT 10.0) Chrome/131";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605";

t("https chrome with support: no complaint",
  micProblemIn({ secure:true, host:"example.com", ua:CHROME, hasSR:true }), null);
t("localhost counts as secure",
  micProblemIn({ secure:false, host:"localhost", ua:CHROME, hasSR:true }), null);
t("plain http is called out",
  /https/i.test(micProblemIn({ secure:false, host:"example.com", ua:CHROME, hasSR:true })), true);
t("iphone gets the keyboard-dictation tip",
  /keyboard/i.test(micProblemIn({ secure:true, host:"x.com", ua:IPHONE, hasSR:false })), true);
t("desktop without support is told to use Chrome",
  /Chrome/.test(micProblemIn({ secure:true, host:"x.com", ua:CHROME, hasSR:false })), true);
t("http beats missing-support in the message order",
  /https/i.test(micProblemIn({ secure:false, host:"x.com", ua:CHROME, hasSR:false })), true);

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

/* ---- the http hint added after the localhost mic failure ---- */
t("http on desktop tells you Chrome needs https",
  /https/i.test(micErrorOnHttp("not-allowed")), true);
t("https on desktop still gives the padlock advice",
  /padlock/i.test(micError("not-allowed")), true);
t("iPhone advice is unaffected by protocol",
  /keyboard/i.test(micErrorOn(true, "not-allowed")), true);


/* ---- hands-free has to use whichever recogniser the device actually has ---- */
/* the failure mode here is silence: the orb says Listening and nothing happens */
{
  const listen = grab("hfListen");
  const nat    = grab("hfListenNative");
  const heard  = grab("hfHeardText");
  const pause  = grab("hfPause");
  const close  = grab("hfClose");
  const inIt = (src, bit) => src.indexOf(bit) > -1;

  t("hands-free uses the recogniser built into the phone when there is one", inIt(listen, "if(nativeMicSupported()) return hfListenNative();"), true);
  t("it checks before touching the browser recogniser", listen.indexOf("nativeMicSupported") < listen.indexOf("new SR()"), true);
  t("the native path starts the microphone the button uses", inIt(nat, "nativeMicStart("), true);
  t("it marks itself so stopping knows which one is running", inIt(nat, "native: true"), true);
  t("it listens again after Apple stops itself on a pause", inIt(nat, "setTimeout(hfListen"), true);
  t("a blocked microphone ends the loop instead of spinning", inIt(nat, "hf.want = false"), true);
  t("both recognisers share the wake-word logic", inIt(heard, "wakeRe()"), true);
  t("the shared handler still asks the question", inIt(heard, "hfAsk("), true);
  t("pausing stops the native microphone too", inIt(pause, "nativeMicStop()"), true);
  t("closing stops the native microphone too", inIt(close, "nativeMicStop()"), true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " mic/image tests passed");
process.exit(fail ? 1 : 0);
