/* Boot the app's real script against a stub DOM to catch startup exceptions.
   Not a browser - but it reliably catches null-element and typo errors. */
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const ids = new Set();
let m, re = /\bid="([A-Za-z0-9_-]+)"/g;
while((m = re.exec(html))) ids.add(m[1]);

const listeners = {};
function mkEl(id){
  const el = {
    id, value:"", textContent:"", innerHTML:"", placeholder:"", disabled:false,
    dataset:{}, style:{}, files:[], options:[], children:[], parentNode:null,
    classList:{ _s:new Set(),
      add(...c){ c.forEach(x=>this._s.add(x)); }, remove(...c){ c.forEach(x=>this._s.delete(x)); },
      toggle(c,f){ f===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (f?this._s.add(c):this._s.delete(c)); },
      contains(c){ return this._s.has(c); } },
    addEventListener(ev, fn){ (listeners[id] = listeners[id] || {})[ev] = fn; },
    removeEventListener(){}, appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, remove(){}, insertBefore(){}, focus(){}, blur(){}, click(){},
    querySelector(){ return mkEl(id + ">q"); },
    querySelectorAll(){ return []; },
    closest(){ return null; }, scrollIntoView(){}, scrollTo(){},
    getContext(){ return { drawImage(){} }; }, toDataURL(){ return "data:image/jpeg;base64,AA"; },
    setAttribute(){}, getAttribute(){ return null; }, contains(){ return false; },
    scrollHeight:100, scrollTop:0, clientHeight:100, width:10, height:10
  };
  return el;
}
const cache = {};
global.document = {
  documentElement: mkEl("html"),
  body: mkEl("body"),
  visibilityState: "visible",
  getElementById(id){
    if(!ids.has(id)) return null;
    return cache[id] || (cache[id] = mkEl(id));
  },
  querySelector(sel){ return mkEl("sel:" + sel); },
  querySelectorAll(){ return []; },
  createElement(t){ return mkEl("new:" + t); },
  addEventListener(){}
};
global.window = {
  addEventListener(){}, matchMedia(){ return { matches:false }; },
  speechSynthesis:{ cancel(){}, speak(){} },
  SpeechRecognition:function(){ return { start(){}, stop(){}, abort(){} }; },
  crypto:{ subtle:{}, getRandomValues:(a)=>a }
};
global.SpeechSynthesisUtterance = function(){ return {}; };
global.navigator = { language:"en-GB", onLine:true, clipboard:{ writeText:()=>Promise.resolve() },
                     serviceWorker:{ register:()=>Promise.resolve() } };
global.location = { protocol:"file:", href:"file:///index.html" };
global.localStorage = { _d:{}, getItem(k){ return this._d[k]||null; },
                        setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
global.fetch = () => new Promise(()=>{});
global.AbortController = function(){ this.signal={}; this.abort=()=>{}; };
global.Image = function(){ return {}; };
global.URL = { createObjectURL:()=>"blob:x", revokeObjectURL(){} };
global.btoa = s => Buffer.from(s, "binary").toString("base64");
global.atob = s => Buffer.from(s, "base64").toString("binary");
global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;
global.Intl = Intl;
global.setTimeout = setTimeout; global.clearTimeout = clearTimeout;
global.matchMedia = () => ({ matches:false });
global.confirm = () => false;
global.Blob = function(){}; global.FileReader = function(){};

let ok = true;
try{
  new Function(js)();
  console.log("BOOT OK - the script runs to completion with no exception");
}catch(e){
  ok = false;
  console.log("BOOT FAILED: " + e.message);
  const line = (e.stack || "").split("\n").find(l => /anonymous|Function/.test(l));
  if(line) console.log("  at " + line.trim());
}

/* now exercise the send path the way a user does */
if(ok){
  const el = cache["input"], btn = cache["btnSend"];
  const L = listeners;
  const checks = [
    ["input listener attached", !!(L["input"] && L["input"]["input"])],
    ["send button click attached", !!(L["btnSend"] && L["btnSend"]["click"])],
    ["keydown on textarea attached", !!(L["input"] && L["input"]["keydown"])],
    ["attach button attached", !!(L["btnAttach"] && L["btnAttach"]["click"])],
    ["mic attached", !!(L["btnMic"] && L["btnMic"]["click"])],
    /* He is a voice assistant - a picture is the one thing he cannot say. The
       button used to say "Next message makes a picture" and then answer in
       words, which is worse than not having it. */
    ["there is no picture button to lie about it", !L["btnImg"]],
    ["settings button attached", !!(L["btnSettings"] && L["btnSettings"]["click"])],
    ["theme button attached", !!(L["btnTheme"] && L["btnTheme"]["click"])],
    ["new chat attached", !!(L["btnNew"] && L["btnNew"]["click"])],
    ["gemini key field attached", !!(L["setGemKey"] && L["setGemKey"]["input"])]
  ];
  let bad = 0;
  checks.forEach(([n, v]) => { console.log((v ? "ok   " : "FAIL ") + n); if(!v) bad++; });

  /* does typing enable the send button? */
  if(L["input"] && L["input"]["input"]){
    el.value = "hello";
    try{
      L["input"]["input"].call(el);
      console.log((btn.disabled === false ? "ok   " : "FAIL ") +
        "typing enables send (disabled=" + btn.disabled + ")");
      if(btn.disabled !== false) bad++;
    }catch(e){ console.log("FAIL typing threw: " + e.message); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
process.exit(1);
