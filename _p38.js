/* Pedro was picking the weakest model on purpose. "flash" is Google's fast,
   cheap tier and "lite" is weaker still; "pro" is the one that can actually
   think. Speed is worth very little if the answers are poor. */
const fs = require("fs");
let h = fs.readFileSync("index.html", "utf8");
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const CRLF = h.indexOf(CR + LF) > -1;
if(CRLF) h = h.split(CR + LF).join(LF);
let bad = 0;
function rep(a, b, label){
  const p = h.split(a);
  if(p.length !== 2){ console.error("MISS (" + (p.length - 1) + "): " + label); bad++; return; }
  h = p.join(b); console.log("ok  " + label);
}

rep(`function bestModel(list){
  if(!list.length) return "";
  var stable = list.filter(function(id){ return !/preview|exp|experimental|thinking|tuning/i.test(id); });
  var pool = stable.length ? stable : list;
  var flash = pool.filter(function(id){ return /flash/i.test(id); });
  var byVersion = (flash.length ? flash : pool).slice().sort(function(a, b){
    var va = parseFloat((a.match(/(\d+\.?\d*)/) || [0, 0])[1]);
    var vb = parseFloat((b.match(/(\d+\.?\d*)/) || [0, 0])[1]);
    return vb - va;                       /* highest version number wins */
  });
  return byVersion[0];
}`,
`/* How good a model is likely to be, in the order that matters:
   pro thinks properly, flash is quick, lite is quick and not much else. */
function modelTier(id){
  if(/lite/i.test(id))  return 1;
  if(/flash/i.test(id)) return 2;
  if(/pro/i.test(id))   return 3;
  return 2;                               /* unfamiliar names sit with flash */
}
function modelVersion(id){
  return parseFloat((id.match(/(\d+\.?\d*)/) || [0, 0])[1]) || 0;
}
function bestModel(list){
  if(!list.length) return "";
  var stable = list.filter(function(id){ return !/preview|exp|experimental|thinking|tuning/i.test(id); });
  var pool = stable.length ? stable : list;
  return pool.slice().sort(function(a, b){
    var ta = modelTier(a), tb = modelTier(b);
    if(ta !== tb) return tb - ta;         /* the one that thinks best, first */
    return modelVersion(b) - modelVersion(a);
  })[0];
}`, "prefer the model that can think");

/* one-time move off the weak default for anyone already set up */
rep(`  geminiKey:"", geminiModel:"gemini-2.5-flash", imageModel:"gemini-2.5-flash-image",`,
`  geminiKey:"", geminiModel:"gemini-2.5-pro", imageModel:"gemini-2.5-flash-image",
  smarterPicked:false,   /* the old default chose the fastest model, not the best one */`,
  "a better starting model");

rep(`      store.settings.geminiModel = fill($("setGemModel"), txtIds, store.settings.geminiModel);`,
`      /* whoever was set up under the old rule got the fastest model rather than
         the best one - move them across once, quietly */
      if(!store.settings.smarterPicked){
        var better = best(txtIds);
        if(better && better !== store.settings.geminiModel &&
           modelTier(better) > modelTier(store.settings.geminiModel)){
          store.settings.geminiModel = better;
        }
        store.settings.smarterPicked = true;
      }
      store.settings.geminiModel = fill($("setGemModel"), txtIds, store.settings.geminiModel);`,
  "move off the weak model once");

/* say what the choice costs, where the choice is made */
rep(`      if(hint) hint.textContent = txtIds.length + " chat models, " + imgIds.length +
        " picture model(s) on your key. Using " + store.settings.geminiModel + ".";`,
`      if(hint) hint.textContent = txtIds.length + " chat models, " + imgIds.length +
        " picture model(s) on your key. Using " + store.settings.geminiModel + ". " +
        (modelTier(store.settings.geminiModel) >= 3
          ? "Pro thinks hardest; Flash is faster with a bigger free allowance."
          : "Flash is fast; Pro answers better if your key allows it.");`,
  "explain the trade where it is made");

fs.writeFileSync("index.html", CRLF ? h.split(LF).join(CR + LF) : h);
console.log(bad ? LF + bad + " MISSED" : LF + "applied");
process.exit(bad ? 1 : 0);
