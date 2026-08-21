/* Simulations as 3D models. He describes what a thing is made of; the app
   builds it. Nothing he sends is run as code, and everything he sends is
   clamped, so a bad answer cannot break the page or reach the app. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
/* A copy of the source with strings, comments and regex literals blanked out.
   Counting braces in the raw text walks straight into "{" and /x{6}/ and never
   finds the end of the function. */
/* Braces live inside strings and regexes, so every hand-written scanner
   eventually swallowed half the file. The shared reader asks the JavaScript
   engine which slice is a whole function instead. */
const { grab, decl } = require("./lib").reader(src);

let fail = 0, pass = 0;
const t = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  if(!ok){ fail++; console.log("FAIL " + n + "\n  got:  " + JSON.stringify(g) + "\n  want: " + JSON.stringify(w)); }
  else { pass++; console.log("ok   " + n); }
};

const read = new Function(grab("spec3dRead") + " return spec3dRead;")();
const known = new Function(decl("SPEC3D_KNOWN") + "\n" + grab("spec3dKnown") + " return spec3dKnown;")();
const KNOWN = new Function(decl("SPEC3D_KNOWN") + " return SPEC3D_KNOWN;")();

/* ---- reading what he sends back ---- */
{
  const good = JSON.stringify({ name: "Windmill", parts: [
    { n: "Tower", s: "cone", p: [0, 0, 0], d: [1, 3, 1], c: "#e0e6f2", note: "Holds it up" },
    { n: "Sail", s: "plate", p: [0, 1, 1], d: [0.2, 2, 0.1], c: "#cfe0f7", spin: "z" }] });
  const spec = read(good);
  t("a described model is read", !!spec, true);
  t("it keeps the name", spec.name, "Windmill");
  t("and every part", spec.parts.length, 2);
  t("a part keeps its name", spec.parts[0].n, "Tower");
  t("and what it is for", spec.parts[0].note, "Holds it up");
  t("a part that turns is allowed to", spec.parts[1].spin, "z");

  t("words instead of a model are refused", read("sure, here's the code"), null);
  t("nothing is refused", read(""), null);
  t("an empty model is refused", read("{}"), null);
  t("a model with no parts is refused", read('{"name":"x","parts":[]}'), null);
  t("broken json is refused", read('{"name":"x","parts":[{'), null);
  t("a model wrapped in chatter is still read",
    !!read('Here you go:\n{"name":"a","parts":[{"n":"b","s":"box"}]}\nhope that helps'), true);
}

/* ---- nothing he sends is trusted ---- */
{
  const nasty = read(JSON.stringify({
    name: "<script>alert(1)</script>",
    parts: [{ n: '</script><img onerror=x>', s: "notashape", p: [999, -999, 1e12],
              d: [-5, 1e9, 0], r: ["nonsense", 1e9, -1e9], c: "javascript:alert(1)",
              note: 'has "quotes" and \\ backslashes', spin: "evil" }]
  }));
  t("markup is stripped from the name", /[<>]/.test(nasty.name), false);
  t("and from a part name", /[<>]/.test(nasty.parts[0].n), false);
  t("quotes cannot escape the note", /["\\]/.test(nasty.parts[0].note), false);
  t("an unknown shape becomes a box", nasty.parts[0].s, "box");
  t("a place too far away is pulled back", nasty.parts[0].p, [6, -6, 6]);
  t("a size of nothing is given a size", nasty.parts[0].d[0] > 0, true);
  t("and a size too big is capped", nasty.parts[0].d[1], 8);
  t("a colour that is not a colour is replaced", nasty.parts[0].c, "#9fd8ff");
  t("only real spins are kept", nasty.parts[0].spin, undefined);
  t("rotations are numbers or nothing", nasty.parts[0].r.every(n => typeof n === "number"), true);

  const flood = read(JSON.stringify({ name: "many", parts: new Array(500).fill(0)
    .map((_, i) => ({ n: "p" + i, s: "box" })) }));
  t("a model with hundreds of parts is cut down", flood.parts.length <= 24, true);
}

/* ---- the ones he knows without asking ---- */
{
  [["a plane", "Passenger plane"], ["an aeroplane", "Passenger plane"],
   ["a rocket", "Rocket"], ["a car", "Car"], ["a house", "House"],
   ["an engine", "Engine"], ["a piston engine", "Engine"], ["an atom", "Atom"]
  ].forEach(([ask, want]) => {
    const spec = known(ask);
    t('"' + ask + '" is known already', spec && spec.name, want);
  });
  t("something nobody wrote down is not", known("a xylophone factory"), null);
  Object.keys(KNOWN).forEach(key => {
    const spec = KNOWN[key].spec;
    t(key + " has enough parts to be worth showing", spec.parts.length >= 6, true);
    t(key + " says what every part does",
      spec.parts.every(p => p.note && p.note.length > 8), true);
    t(key + " uses shapes the renderer has",
      spec.parts.every(p => ["box", "cyl", "cone", "ball", "plate", "wedge"].indexOf(p.s) > -1), true);
    t(key + " is centred and a sensible size",
      spec.parts.every(p => (p.p || [0,0,0]).every(n => Math.abs(n) <= 6)), true);
  });
}

/* ---- more than one thing at once ---- */
{
  const things = new Function(decl("NOT_A_THING") + String.fromCharCode(10) +
    grab("spec3dThings") + " return spec3dThings;")();
  t("one thing is one thing", things("a plane").length, 1);
  t("two things are two", things("a phone and an ipad"), ["a phone", "an ipad"]);
  t("a comma separates them too", things("a car, a rocket").length, 2);
  t("so does versus", things("a plane vs a rocket").length, 2);
  t("three is still fine", things("a car and a house and a rocket").length, 3);
  t("but a description is not a second thing",
    things("a black and white cat"), ["a black and white cat"]);
  t("nor is a pair of sizes", things("a big and small gear").length, 1);
  t("and no more than four are lined up",
    things("a car and a house and a plane and a rocket and an atom").length, 4);

  const merge = new Function(grab("spec3dMerge") + " return spec3dMerge;")();
  const one = { name: "A", parts: [{ n: "bit", s: "box", p: [0,0,0], d: [1,1,1], c: "#fff" }] };
  const two = { name: "B", parts: [{ n: "bit", s: "box", p: [0,0,0], d: [1,1,1], c: "#fff" }] };
  const both = merge([JSON.parse(JSON.stringify(one)), JSON.parse(JSON.stringify(two))]);
  t("both are kept", both.parts.length, 2);
  t("each part says which one it belongs to",
    both.parts.map(p => p.n), ["A: bit", "B: bit"]);
  t("and they are moved apart", Math.abs(both.parts[0].p[0] - both.parts[1].p[0]) >= 2.2, true);
  t("the name covers the lot", both.name, "A and B");

  const knownAll = new Function(decl("SPEC3D_KNOWN") + String.fromCharCode(10) +
    decl("NOT_A_THING") + String.fromCharCode(10) +
    grab("spec3dThings") + grab("spec3dMerge") + grab("spec3dKnown") +
    grab("spec3dKnownAll") + " return spec3dKnownAll;")();
  t("two he knows are shown together offline",
    knownAll("a car and a house").parts.length > 10, true);
  t("but if one is unknown he asks rather than showing half",
    knownAll("a car and a xylophone factory"), null);
}

/* ---- how it is put together ---- */
{
  const has = s => src.indexOf(s) > -1;
  const build = grab("vizBuild");
  t("a model is what he is asked for", build.indexOf("run(spec3dAsk(about))") > -1, true);
  t("a model is taken over a page of code", build.indexOf("if(done3d(text)) return;") > -1, true);
  t("with no signal the known ones are used", build.indexOf("spec3dKnownAll(about)") > -1, true);
  t("and anything else is still drawn here", build.indexOf("vizLocal(about)") > -1, true);
  t("what is shown is a page built here, from the spec",
    build.indexOf("spec3dPage(made)") > -1, true);
  t("he says which parts can be tapped", build.indexOf("Tap a part") > -1, true);

  const ask = grab("spec3dAsk");
  t("he is asked for JSON and nothing else", ask.indexOf("No words outside") > -1, true);
  t("and for a sensible number of parts", ask.indexOf("6 and 14") > -1, true);
  t("and for a line on what each part does", ask.indexOf("what this part does") > -1, true);

  /* the renderer itself */
  t("the renderer is kept whole, as text", has("var VIZ3D_RENDER ="), true);
  t("the spec is put in as data, not as code",
    grab("spec3dPage").indexOf("JSON.stringify(spec)") > -1, true);
  t("up is up", has("- y1 * mid * 0.78 * persp * view.zoom"), true);
  t("and moving it does not flip that", has("H / 2 + view.py * dpr2 - y1 * mid"), true);
  t("and the outside of a shape faces you", has("if(cross >= 0) continue;"), true);
  t("the ball turns into the thing", has("f.from = f.pts.map"), true);
  t("a tap tells the app which part it was", has("pedroPart"), true);
  t("and the app only listens to its own frames",
    has("if(!mine) return;"), true);
}

/* ---- building anything, in the workbench ---- */
{
  const has = x => src.indexOf(x) > -1;
  t("the workbench has somewhere to stand what is built",
    has(String.fromCharCode(60) + 'iframe id="wbBuilt"'), true);
  t("and what is built takes over from the parts board",
    has("#wb.built #wbBoard{display:none}"), true);
  const build = grab("wbBuild");
  t("what he already knows goes up at once",
    build.indexOf("spec3dKnownAll(what)") > -1, true);
  t("anything else he works out", build.indexOf("spec3dAsk(what)") > -1, true);
  t("and it stops as soon as the model is whole",
    build.indexOf("abortCtl.abort()") > -1, true);
  t("he says plainly when he cannot do it without a signal",
    build.indexOf("I need the online model") > -1, true);
  t("what arrives is checked before it is used",
    build.indexOf("spec3dRead(text)") > -1, true);
  const add2 = grab("wbBuiltAdd");
  t("things stack up rather than replacing each other",
    add2.indexOf("wb.built.push(spec)") > -1, true);
  t("with a limit on how many stand there", add2.indexOf("length >= 4") > -1, true);
  const show = grab("wbShowBuilt");
  t("two or more are stood side by side", show.indexOf("spec3dMerge") > -1, true);
  t("and the page is built here, from the spec", show.indexOf("spec3dPage(whole)") > -1, true);
  const voice = grab("wbVoice");
  t("asking for something not in the tray builds it",
    voice.indexOf("wbBuild(asked || want") > -1, true);
  t("and the article is kept, so it reads properly",
    voice.indexOf("asked = s.replace") > -1, true);
  t("just naming a thing builds it too", voice.indexOf("wbBuild(s,") > -1, true);
  t("clearing takes the built things away as well",
    grab("wbWipe").indexOf("wb.built = []") > -1, true);
  t("a tap inside what was built is heard", has("built.contentWindow"), true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " model tests passed");
process.exit(fail ? 1 : 0);
