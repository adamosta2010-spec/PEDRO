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
eval([grab("pickModels"), grab("modelTier"), grab("modelVersion"), grab("bestModel")].join("\n"));

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

const GEN = ["generateContent","countTokens"];
/* a realistic-shaped response, including models newer than my training data */
const resp = { models: [
  { name:"models/gemini-3-pro",                 supportedGenerationMethods:GEN },
  { name:"models/gemini-3-flash",               supportedGenerationMethods:GEN },
  { name:"models/gemini-2.5-flash",             supportedGenerationMethods:GEN },
  { name:"models/gemini-2.5-pro",               supportedGenerationMethods:GEN },
  { name:"models/gemini-3-flash-preview",       supportedGenerationMethods:GEN },
  { name:"models/gemini-3-flash-image",         supportedGenerationMethods:GEN },
  { name:"models/imagen-4.0-generate",          supportedGenerationMethods:GEN },
  { name:"models/text-embedding-004",           supportedGenerationMethods:["embedContent"] },
  { name:"models/gemini-embedding-001",         supportedGenerationMethods:["embedContent"] },
  { name:"models/aqa",                          supportedGenerationMethods:["generateAnswer"] }
]};

const s = pickModels(resp);
t("embeddings excluded", s.chat.concat(s.image).some(id => /embedding/.test(id)), false);
t("aqa excluded", s.chat.concat(s.image).some(id => /aqa/.test(id)), false);
t("image models split out", s.image, ["gemini-3-flash-image","imagen-4.0-generate"]);
t("chat models keep the rest",
  s.chat, ["gemini-3-pro","gemini-3-flash","gemini-2.5-flash","gemini-2.5-pro","gemini-3-flash-preview"]);

/* the whole point: pick something real, and prefer the model that thinks
   rather than the one that answers fastest - speed is worth little if the
   answers are poor */
t("prefers pro over flash", bestModel(s.chat), "gemini-3-pro");
t("newest pro wins among pros",
  bestModel(["gemini-2.5-pro","gemini-3-pro"]), "gemini-3-pro");
t("flash beats lite", bestModel(["gemini-3-flash-lite","gemini-2.5-flash"]), "gemini-2.5-flash");
t("lite is the last resort", bestModel(["gemini-3-lite"]), "gemini-3-lite");
t("newest flash when there is no pro",
  bestModel(["gemini-2.5-flash","gemini-3-flash"]), "gemini-3-flash");
t("skips preview builds", bestModel(["gemini-4-pro-preview","gemini-3-pro"]), "gemini-3-pro");
t("falls back to preview if that is all there is",
  bestModel(["gemini-4-flash-preview"]), "gemini-4-flash-preview");
t("empty list is safe", bestModel([]), "");
t("single option", bestModel(["gemini-9-flash"]), "gemini-9-flash");
t("an unknown name ranks with flash, not above pro",
  bestModel(["gemini-3-something","gemini-2.5-pro"]), "gemini-2.5-pro");

/* a key with nothing usable must not silently pick garbage */
const none = pickModels({ models:[{ name:"models/text-embedding-004", supportedGenerationMethods:["embedContent"] }] });
t("no usable models yields empties", none, { chat:[], image:[] });
t("malformed response is safe", pickModels({}), { chat:[], image:[] });

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " discovery tests passed");
process.exit(fail ? 1 : 0);
