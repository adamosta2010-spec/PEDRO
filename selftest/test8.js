/* Building mode. The board is only worth having if the electricity is real:
   a battery wired to a lamp lights it, an open switch stops it, two lamps in
   series are dimmer than one, and a battery wired to itself is a short. */
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
function chunk(startsWith){
  const i = src.indexOf(startsWith);
  if(i < 0) throw new Error("missing: " + startsWith);
  const end = src.indexOf(";", src.indexOf("}", i));
  return src.slice(i, end + 1);
}

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

/* the solver, lifted straight out of the app */
const solve = new Function(
  chunk("var WB_KIT = {") + "\n" + grab("wbGauss") + "\n" + grab("wbSolve") +
  "\n return { solve: wbSolve, kit: WB_KIT };")();
const wbSolve = solve.solve, KIT = solve.kit;

let seq = 0;
const P = (kind, extra) => Object.assign({ id: "p" + (++seq), kind: kind }, extra || {});
const W = (a, ap, b, bp) => ({ a: a.id + ":" + ap, b: b.id + ":" + bp });
/* the usual loop: battery + -> part -> battery - */
function loop(parts){
  const w = [];
  for(let i = 0; i < parts.length; i++){
    const here = parts[i], next = parts[(i + 1) % parts.length];
    w.push(W(here, KIT[here.kind].volts ? 0 : 1, next, KIT[next.kind].volts ? 1 : 0));
  }
  return w;
}

/* ---------- a battery and a lamp ---------- */
{
  const bat = P("battery"), lamp = P("lamp");
  const r = wbSolve([bat, lamp], loop([bat, lamp]), true);
  t("the lamp lights", r.lit[lamp.id] > 0.5, true);
  t("current actually flows", r.amps[lamp.id] > 0.2, true);
  t("it counts as running", r.live, true);
  t("nothing is wrong with it", r.why, "");
  t("it is not a short", r.shorted, false);
  /* 9V across 24 ohms and half an ohm inside = about 0.37A */
  t("the current is about right", Math.abs(r.amps[lamp.id] - 9 / 24.5) < 0.01, true);
  t("nearly all the voltage lands on the lamp",
    Math.abs(r.volts[lamp.id] - 9 * 24 / 24.5) < 0.05, true);
}

/* ---------- the switch ---------- */
{
  const bat = P("battery"), sw = P("toggle", { on: false }), lamp = P("lamp");
  const wires = loop([bat, sw, lamp]);
  const off = wbSolve([bat, sw, lamp], wires, true);
  t("an open switch stops the lamp", off.lit[lamp.id] < 0.01, true);
  t("and it says why", /switch is open/.test(off.why), true);
  sw.on = true;
  const on = wbSolve([bat, sw, lamp], wires, true);
  t("closing it lights the lamp", on.lit[lamp.id] > 0.5, true);
  t("and then there is nothing to explain", on.why, "");
}

/* ---------- more lamps ---------- */
{
  const bat = P("battery"), l1 = P("lamp"), l2 = P("lamp");
  const one = wbSolve([bat, l1], loop([bat, l1]), true);
  const two = wbSolve([bat, l1, l2], loop([bat, l1, l2]), true);
  t("two lamps in a row are dimmer than one", two.lit[l1.id] < one.lit[l1.id], true);
  t("and they share it evenly",
    Math.abs(two.lit[l1.id] - two.lit[l2.id]) < 1e-6, true);
  t("the same current goes through both",
    Math.abs(two.amps[l1.id] - two.amps[l2.id]) < 1e-6, true);
}
{
  /* side by side, each still gets the full voltage */
  const bat = P("battery"), l1 = P("lamp"), l2 = P("lamp");
  const wires = [W(bat, 0, l1, 0), W(bat, 0, l2, 0), W(l1, 1, bat, 1), W(l2, 1, bat, 1)];
  const r = wbSolve([bat, l1, l2], wires, true);
  t("two lamps side by side both light", r.lit[l1.id] > 0.4 && r.lit[l2.id] > 0.4, true);
  t("and the battery gives twice the current",
    Math.abs(r.amps[bat.id]) > 1.8 * Math.abs(r.amps[l1.id]), true);
}

/* ---------- the ways it goes wrong ---------- */
{
  const lamp = P("lamp"), sw = P("toggle");
  const r = wbSolve([lamp, sw], loop([lamp, sw]), true);
  t("with no battery nothing happens", r.live, false);
  t("and it says to add one", /battery/.test(r.why), true);
}
{
  const bat = P("battery"), lamp = P("lamp");
  const r = wbSolve([bat, lamp], [], true);
  t("with no wires nothing happens", r.live, false);
  t("and it says so", /wired up/.test(r.why), true);
}
{
  const bat = P("battery"), lamp = P("lamp");
  const r = wbSolve([bat, lamp], [W(bat, 0, bat, 1)], true);
  t("a battery wired to itself is a short", r.shorted, true);
  t("and it is called out", /straight back/.test(r.why), true);
}
{
  const bat = P("battery"), lamp = P("lamp");
  const half = [W(bat, 1, lamp, 0)];             /* only one end joined */
  const r = wbSolve([bat, lamp], half, true);
  t("a loose end means no current", r.live, false);
  t("and it says which", /loose end/.test(r.why), true);
}
{
  const bat = P("battery"), lamp = P("lamp");
  const r = wbSolve([bat, lamp], loop([bat, lamp]), false);
  t("with the power off nothing runs", r.live, false);
  t("and that is the reason given", /power is off/.test(r.why), true);
}
{
  /* a part sitting on the board touching nothing used to make the maths
     unsolvable - the tiny leak to ground is what stops that */
  const bat = P("battery"), lamp = P("lamp"), lonely = P("motor");
  const r = wbSolve([bat, lamp, lonely], loop([bat, lamp]), true);
  t("a part with nothing attached does not break it", r.lit[lamp.id] > 0.5, true);
  t("and it just sits there", Math.abs(r.amps[lonely.id]) < 1e-3, true);
}

/* ---------- the LED only works one way round ---------- */
{
  const bat = P("battery"), led = P("led");
  const right = wbSolve([bat, led], loop([bat, led]), true);
  t("an LED the right way round lights", right.lit[led.id] > 0.2, true);
  const back = wbSolve([bat, led], [W(bat, 0, led, 1), W(led, 0, bat, 1)], true);
  t("turned around it stays dark", Math.abs(back.amps[led.id]) < 1e-6, true);
}

/* ---------- motors and buzzers ---------- */
{
  const bat = P("battery"), mot = P("motor");
  const r = wbSolve([bat, mot], loop([bat, mot]), true);
  t("a motor turns", r.lit[mot.id] > 0.5, true);
  t("the kit knows it spins", KIT.motor.spins, true);
  const bz = P("buzzer");
  const r2 = wbSolve([bat, bz], loop([bat, bz]), true);
  t("a buzzer sounds", r2.lit[bz.id] > 0.1, true);
}
{
  /* a resistor in the way makes the lamp dimmer, which is the whole point */
  const bat = P("battery"), lamp = P("lamp"), res = P("resistor");
  const plain = wbSolve([bat, lamp], loop([bat, lamp]), true);
  const slowed = wbSolve([bat, lamp, res], loop([bat, lamp, res]), true);
  t("a resistor dims the lamp a lot", slowed.lit[lamp.id] < plain.lit[lamp.id] / 10, true);
}
{
  /* a small cell cannot do what a 9V can */
  const cell = P("cell"), lamp = P("lamp");
  const r = wbSolve([cell, lamp], loop([cell, lamp]), true);
  t("an AA barely lights a 3W lamp", r.lit[lamp.id] < 0.05, true);
  t("but something does go through it", r.amps[lamp.id] > 0.01, true);
}

/* ---------- every part in the tray is usable ---------- */
Object.keys(KIT).forEach(function(kind){
  const bat = P("battery"), part = P(kind, KIT[kind].toggles ? { on: true } : null);
  const r = wbSolve([bat, part], loop([bat, part]), true);
  t(kind + " can be wired up without breaking anything",
    typeof r.amps[part.id] === "number" && isFinite(r.amps[part.id]), true);
});
t("an LED is called an LED out loud, not a led",
  src.indexOf(String.fromCharCode(34)+"Added "+String.fromCharCode(34)+" + wbAnArt(kind)")>-1, true);
t("and it takes an", /art:"an"/.test(src), true);
t("the tray has the parts you would expect",
  ["battery", "lamp", "toggle", "led", "motor", "resistor", "buzzer"]
    .every(k => KIT[k]), true);

/* ---------- the words that open it ---------- */
{
  const line = src.match(/var BUILD_MODE_RE = new RegExp\([\s\S]*?\);/)[0];
  const RE = new Function(line + " return BUILD_MODE_RE;")();
  ["build", "building", "build mode", "building mode", "open build mode",
   "the workbench", "start building", "let's build"].forEach(s =>
    t('"' + s + '" opens the workbench', RE.test(s), true));
  ["build me an engine", "simulate an engine", "build a website", "what is a battery"]
    .forEach(s => t('"' + s + '" does not', RE.test(s), false));
}

/* ---------- talking to it while it is open ---------- */
{
  const names = new Function(chunk("var WB_NAMES = {") + " return WB_NAMES;")();
  t("a bulb is a lamp", names.bulb, "lamp");
  t("a light is a lamp", names.light, "lamp");
  t("a switch is the toggle", names["switch"], "toggle");
  t("a speaker is the buzzer", names.speaker, "buzzer");
  const add = new Function(src.match(/var WB_ADD_RE = [^\n]+/)[0] + " return WB_ADD_RE;")();
  ["add a battery", "add a lamp", "put a switch on the board", "give me a motor",
   "i want a led", "drop a resistor", "add an led", "add another lamp",
   "drop an aa cell", "add the motor", "add lamp"].forEach(s =>
    t('"' + s + '" is heard as adding a part', add.test(s), true));
  t("and the part is picked out of it", "add a lamp".match(add)[1].trim(), "lamp");
  /* an is longer than a: matching a first captured "n led" and added nothing */
  t("an article is not mistaken for part of the name",
    "add an led".match(add)[1].trim(), "led");
  t("another works the same way",
    "add another lamp".match(add)[1].trim(), "lamp");
  t("and a two word part still comes through",
    "drop an aa cell".match(add)[1].trim(), "aa cell");
}

/* ---------- it is wired into the app ---------- */
{
  const has = s => src.indexOf(s) > -1;
  t("building mode is checked before the model is asked",
    src.indexOf("BUILD_MODE_RE.test") < src.indexOf("if(theSmallThings(question))"), true);
  t("its own words win while it is open",
    src.indexOf("var did = wbVoice(question)") < src.indexOf("BUILD_MODE_RE.test"), true);
  t("and it still hands the microphone back", has("carryOn(did || undefined)"), true);
  t("the board is on the page", has('<svg id="wbBoard"'), true);
  t("there is a tray to take parts from", has('id="wbTray"'), true);
  t("dragging a wire is possible", grab("wbTouch").indexOf('kind:"wire"') > -1, true);
  t("and dragging a part around too", grab("wbTouch").indexOf('kind:"move"') > -1, true);
  t("tapping a switch flips it",
    grab("wbTouch").indexOf("p.on = p.on === false") > -1, true);
  t("wiring both ends of one part to itself is refused",
    grab("wbJoin").indexOf('a.split(":")[0] === b.split(":")[0]') > -1, true);
  t("the same wire cannot be run twice", grab("wbJoin").indexOf("have") > -1, true);
  t("current is drawn moving along live wires", has("wbflow"), true);
  t("opening it clears the panels off the top",
    grab("wbOpen").indexOf("closePanels()") > -1, true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " workbench tests passed");
process.exit(fail ? 1 : 0);
