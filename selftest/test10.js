/* Words picked up by accident used to become questions, and the model - told
   to do jokes and stories properly - would improvise one. "I said Pedro and it
   said Adam I have got a problem my phone is broken" came from exactly that. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
function grab(name){
  const i = src.indexOf("function " + name + "(");
  if(i < 0) throw new Error("no such function: " + name);
  let d = 0;
  for(let k = src.indexOf("{", i); k < src.length; k++){
    if(src[k] === "{") d++;
    else if(src[k] === "}"){ d--; if(!d) return src.slice(i, k + 1); }
  }
}
function decl(name){
  const i = src.indexOf("var " + name + " =");
  if(i < 0) throw new Error("no such declaration: " + name);
  /* to the semicolon that ends the statement, across however many lines */
  let depth = 0;
  for(let k = i; k < src.length; k++){
    const ch = src[k];
    if(ch === "(") depth++;
    else if(ch === ")") depth--;
    else if(ch === ";" && depth === 0) return src.slice(i, k + 1);
  }
  throw new Error("unterminated: " + name);
}
let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

const worth = new Function(
  decl("HF_FILLER") + "\n" + decl("HF_SHORT_ASK") + "\n" + grab("worthAnswering") +
  "\n return worthAnswering;")();

/* things actually said to him */
[["what is the capital of france"], ["tell me a joke"], ["how does an engine work"],
 ["why"], ["how come"], ["again"], ["really"], ["what about the sun"],
 ["carry on"], ["yes"], ["no"], ["stop"], ["and the moon"]
].forEach(([q]) => t('"' + q + '" is answered', worth(q), true));

/* things picked up by accident */
[["uh"], ["um"], ["uh um"], ["hmm"], ["yeah"], ["ok"], ["okay"], ["right"],
 ["so"], ["like"], ["the"], ["a"], ["and"], ["hi"], ["hey"], ["yo"],
 ["ok so like"], ["um yeah ok"], ["mm hmm"], [""], ["   "], ["..."]
].forEach(([q]) => t('"' + q + '" is let go', worth(q), false));

/* a single stray word is not a question, but three words probably are */
t("one stray word is ignored", worth("engine"), false);
t("two stray words are ignored", worth("engine thing"), false);
t("three words are taken seriously", worth("the engine broke"), true);

/* it must not have got so strict that ordinary things stop working */
t("a short follow-up still works", worth("why not"), true);
t("so does a one word answer to his question", worth("yes"), true);

/* where it is used */
{
  const has = s => src.indexOf(s) > -1;
  t("a settled noise is dropped rather than asked",
    grab("hfSettle").indexOf("worthAnswering(q)") > -1, true);
  t("a finished noise is dropped too",
    grab("hfHeardText").indexOf("worthAnswering(finalTxt)") > -1, true);
  t("and he does not start thinking about one",
    grab("draftable").indexOf("worthAnswering(s)") > -1, true);
  t("dropping one leaves him listening, not stuck",
    grab("hfSettle").indexOf("hfQuietTimer()") > -1, true);
  t("the model is told what to do when the words do not add up",
    has("say you did not catch that and stop"), true);
  t("and told not to make something up instead",
    has("Never invent a situation"), true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " misheard-speech tests passed");
process.exit(fail ? 1 : 0);
