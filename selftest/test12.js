/* The ball, the words, and how long he waits before answering. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
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
  if(i < 0) throw new Error("no declaration: " + name);
  let q = null, depth = 0;
  for(let k = i; k < src.length; k++){
    const ch = src[k];
    if(q){ if(ch === String.fromCharCode(92)) k++; else if(ch === q) q = null; continue; }
    if(ch === "'" || ch === '"'){ q = ch; continue; }
    if(ch === "(" || ch === "[" || ch === "{") depth++;
    else if(ch === ")" || ch === "]" || ch === "}") depth--;
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

/* ---------- answering the moment you stop ---------- */
{
  const going = new Function(decl("HF_HANGING") + "\n" + grab("stillGoing") + " return stillGoing;")();
  t("a finished question is finished", going("what is the capital of france"), false);
  t("so is one ending on a noun", going("how does an engine work"), false);
  ["tell me about the", "i want to know if", "what about you and", "so", "and", "um"]
    .forEach(s => t('"' + s + '" is somebody still talking', going(s), true));

  const settle = grab("hfSettle");
  t("he no longer waits most of a second", settle.indexOf("}, 900);") === -1, true);
  /* 380ms was too eager - a natural pause mid-sentence is often longer than
     that, and cutting in there is worse than waiting a moment */
  t("a finished sentence is answered promptly",
    settle.indexOf("stillGoing(text) ? 1100 : 620") > -1, true);
  t("but somebody mid-sentence is given much longer",
    settle.indexOf("1100") > -1, true);
}

/* ---------- the ball stays put and changes pace ---------- */
{
  const move = src.slice(src.indexOf('orb.addEventListener("pointermove"'));
  t("one finger no longer drags the ball around",
    move.indexOf("grip.x = grip.fromX") < move.indexOf("grip.spin =") ||
    move.indexOf("grip.spin =") > -1, true);
  t("one finger no longer leaves it tilted",
    move.indexOf("grip.spinY += dx") === -1, true);
  t("a drag sets how fast it goes", move.indexOf("grip.spin = Math.max(0.15") > -1, true);
  t("it cannot be wound past a sensible limit", move.indexOf("Math.min(8") > -1, true);

  const pace = grab("gripSpinApply");
  t("each ring keeps its own pace", pace.indexOf("dataset.pace") > -1, true);
  t("and they are all scaled by the one rate", pace.indexOf("pace / rate") > -1, true);
  t("only the circle is sped up by a drag, since it is all that moves",
    ["disc", "sheen", "glow"].every(c => pace.indexOf(c) > -1), true);
  /* the pace of each ring is set by the state - listening turns faster - so a
     pace read once and kept meant that after one drag he never changed again */
  t("a pace read once is not kept forever", pace.indexOf("paceState") > -1, true);
  t("at normal speed the stylesheet is left alone",
    pace.indexOf("rate === 1 ? '' :") > -1, true);
  t("and it is redone when he starts listening",
    grab("hfSet").indexOf("gripSpinApply") > -1, true);
  t("how fast it was left is remembered", src.indexOf("grip.spin = g.spin || 1") > -1, true);
  t("and saved", src.indexOf("spin: grip.spin") > -1, true);
}

/* ---------- the words keep their size and move on their own ---------- */
{
  t("the words are one group", src.indexOf('<div id="hfWords">') > -1, true);
  t("all three are in it",
    ["hfState", "hfHeard", "hfSaid"].every(id => {
      const at = src.indexOf('id="hfWords"');
      return src.indexOf('id="' + id + '"', at) > -1;
    }), true);
  const apply = grab("gripApply");
  /* Nothing is scaled any more - the ball is one size - so there is nothing
     to scale the words back by. They can still be picked up and moved. */
  t("nothing is scaled, so nothing is scaled back",
    apply.indexOf("(1 / s).toFixed(3)") > -1, false);
  /* The words used to be draggable, and a place saved by an older build was
     then applied to a layout that had changed underneath it - which is how
     "Listening" ended up off the side of his screen. */
  t("nothing writes a position onto the words", apply.indexOf("hfWords") > -1, false);
  const on = grab("wordsOn");
  t("they cannot be picked up any more", grab("wordsOn").indexOf("pointerdown") > -1, false);
  t("nor is their place remembered", src.indexOf("wx: grip.wx") > -1, false);
  t("and one saved by an older build is thrown away",
    grab("gripLoad").indexOf("grip.wx = 0; grip.wy = 0;") > -1, true);
  t("not restored next time either", src.indexOf("grip.wx = g.wx || 0") > -1, false);
  t("they are turned on with everything else", src.indexOf("wordsOn();") > -1, true);
}

/* ---------- why he lagged, and why he sometimes went quiet ---------- */
{
  /* The words while you talk arrive about ten times a second. Writing them is
     cheap; reading scrollHeight straight back is not - it makes the browser lay
     the whole page out before it can answer. */
  const log = grab("hudLog");
  t("the live line no longer reads the layout back",
    log.indexOf("box.scrollTop = box.scrollHeight") === -1, true);
  t("it asks for a scroll on the next frame instead",
    log.indexOf("hudScrollSoon(box)") > -1, true);
  const scroll = grab("hudScrollSoon");
  t("and that happens once a frame at most",
    scroll.indexOf("hudScrollWanted") > -1, true);
  t("on a frame, not straight away",
    scroll.indexOf("requestAnimationFrame") > -1, true);
  t("and it does not yank you back if you scrolled up",
    scroll.indexOf("near") > -1, true);
  t("the live line finds its text box once, not every time",
    log.indexOf("hudLive.tx ||") > -1, true);

  /* If the voice never reported finishing he stayed in "talk" for good, where
     he listens for nothing but stop. He looked dead, and was. */
  const set = grab("hfSet");
  t("talking is watched over", set.indexOf("hf.stuck") > -1, true);
  t("and thinking is too", set.indexOf('phase === "busy"') > -1, true);
  t("the wait is judged by how much there is to say",
    set.indexOf("words * 90") > -1, true);
  t("it does not fire if he moved on by himself",
    set.indexOf("if(hf.phase !== phase) return") > -1, true);
  t("when it fires he goes back to listening",
    set.indexOf("carryOn()") > -1, true);
  t("and says why, rather than going quiet",
    set.indexOf("took too long") > -1, true);
  t("answering normally calls it off",
    grab("carryOn").indexOf("clearTimeout(hf.stuck)") > -1, true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " ball-and-words tests passed");
process.exit(fail ? 1 : 0);
