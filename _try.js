const fs = require("fs");
const h = fs.readFileSync("index.html", "utf8");
const src = h.match(/<script>([\s\S]*?)<\/script>/)[1];
function grab(n){
  const i = src.indexOf("function " + n + "(");
  let d = 0;
  for(let k = src.indexOf("{", i); k < src.length; k++){
    if(src[k] === "{") d++;
    else if(src[k] === "}"){ d--; if(!d) return src.slice(i, k + 1); }
  }
}
function grabVar(name){
  const i = src.indexOf("var " + name);
  const j = src.indexOf(";", i);
  return src.slice(i, j + 1);
}
let store = { settings: { name: "Adam", memories: [] } };
const save = () => {};
const uid = () => "i" + Math.random().toString(36).slice(2, 7);
const memories = () => store.settings.memories;
const code = src.match(/var MEMORY_RULES[\s\S]*?\n\];/)[0] + "\n" +
             grabVar("REMEMBER_RE") + "\n" + grabVar("FORGET_RE") + "\n" +
             ["sameMemory","addMemory","forgetMemory","rememberFrom","recallFor","relevance"].map(grab).join("\n");
eval(code);
const say = t => console.log("  " + JSON.stringify(t) + "  ->  " + JSON.stringify(rememberFrom(t)));
say("my name is Adam");
say("i live in London");
say("i am a student");
say("i love roblox games");
say("remember that my wifi password is on the fridge");
say("what is my name?");
say("i love roblox games");
console.log("stored:", memories().length);
console.log("recall for 'what games do i like':", recallFor("what games do i like", 5));
forgetMemory("roblox");
console.log("after forgetting roblox:", memories().map(m => m.text));
