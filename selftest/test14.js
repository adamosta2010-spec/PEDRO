/* Doing things on the phone. He picks a tool, the app does it with the phone's
   own machinery, and what happened goes back to him.
   Nothing he sends is trusted: only tools that exist can be run, and every
   argument is turned into a plain string of a sensible length first. */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

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

const TOOLS = new Function("Native", "APPS", "appNamed", "openThing", "whenIsThat", "startTimer",
  decl("TOOLS") + " return TOOLS;")(null, {}, () => null, () => Promise.resolve(), () => null, () => {});
const read = new Function(decl("TOOLS") + "\n" + grab("toolRead") + " return toolRead;")();
const when = new Function(grab("whenIsThat") + " return whenIsThat;")();

/* ---- the tools he has ---- */
{
  ["web.search", "web.open", "maps.directions", "app.open", "message.write",
   "phone.call", "mail.write", "calendar.add", "reminder.add", "contact.find",
   "shortcut.run", "timer.set"].forEach(name =>
    t(name + " is one of them", !!TOOLS[name], true));
  t("every tool says what it needs",
    Object.keys(TOOLS).every(k => TOOLS[k].needs && TOOLS[k].tell), true);
  t("every tool can be run", Object.keys(TOOLS).every(k => typeof TOOLS[k].run === "function"), true);

  /* the ones the phone will not let him finish on his own */
  t("a message needs a tap", TOOLS["message.write"].hands, true);
  t("a call needs a tap", TOOLS["phone.call"].hands, true);
  t("an email needs a tap", TOOLS["mail.write"].hands, true);
  t("a calendar entry does not", !TOOLS["calendar.add"].hands, true);
  t("nor does a reminder", !TOOLS["reminder.add"].hands, true);
}

/* ---- reading what he chose ---- */
{
  const call = read('{"tool":"web.search","args":{"q":"everest"}}');
  t("a tool call is read", call && call.tool, "web.search");
  t("with its arguments", call.args.q, "everest");
  t("a tool call wrapped in chatter is still read",
    read('Sure. {"tool":"timer.set","args":{"minutes":5}}').tool, "timer.set");

  t("plain words are not a tool call", read("Paris is the capital of France."), null);
  t("nothing is not a tool call", read(""), null);
  t("a made up tool is refused", read('{"tool":"phone.wipe","args":{}}'), null);
  t("something that is not a tool call is refused", read('{"hello":"there"}'), null);
  t("broken json is refused", read('{"tool":"web.search",'), null);

  const long = read('{"tool":"web.search","args":{"q":"' + "x".repeat(5000) + '"}}');
  t("an enormous argument is cut down", long.args.q.length <= 400, true);
  const odd = read('{"tool":"web.search","args":{"q":{"nested":"thing"},"n":7,"b":true}}');
  t("a nested argument becomes plain text", typeof odd.args.q, "string");
  t("numbers are left as numbers", odd.args.n, 7);
  t("and so are yes and no", odd.args.b, true);
}

/* ---- sums, worked out here rather than in his head ---- */
{
  const sum = new Function(grab("sumUp") + " return sumUp;")();
  [["2+2","4"],["(12+8)*3","60"],["2^10","1024"],["1,250 + 750","2000"],
   ["5 - 3 * 2","-1"],["17% of 340","57.8"],["20 percent of 50","10"],
   ["15% off 80","12"],["100/4","25"]]
    .forEach(([q,want]) => t('"' + q + '" comes out right', sum(q), want));
  t("dividing by nothing is said, not crashed", sum("5/0"), "that does not divide");
  /* nothing is ever run - it is read into numbers and added up */
  ["rm -rf /", "alert(1)", "process.exit()", "fetch('http://x')", "1+1; alert(1)"]
    .forEach(q => t('"' + q + '" is refused outright', sum(q), null));
  t("and the working is not done with eval",
    grab("sumUp").indexOf("eval") === -1, true);
}

/* ---- when is that ---- */
{
  t("a proper date is understood", !!when("2026-08-22T15:00"), true);
  t("and read back the right way round",
    when("2026-08-22T15:00").iso, "2026-08-22T15:00:00");
  t("a date with no time gets a sensible one",
    when("2026-08-22").iso.indexOf("2026-08-22T09:00") === 0, true);
  t("in twenty minutes is understood", !!when("in 20 minutes"), true);
  t("in two hours is understood", !!when("in 2 hours"), true);
  t("tomorrow at 3pm is understood", when("tomorrow at 3pm").iso.indexOf("T15:00") > -1, true);
  t("tonight at 8 is in the evening", when("tonight at 8").iso.indexOf("T20:00") > -1, true);
  t("half past is kept", when("tomorrow at 3:30pm").iso.indexOf("T15:30") > -1, true);
  t("midday is not midnight", when("tomorrow at 12pm").iso.indexOf("T12:00") > -1, true);
  t("nonsense is not a date", when("gibberish"), null);
  t("nothing is not a date", when(""), null);
  t("a date always comes with words to say it back",
    when("tomorrow at 3pm").said.length > 5, true);
}

/* ---- how it is wired in ---- */
{
  const has = s => src.indexOf(s) > -1;
  const ask = grab("hfAsk");
  t("an answer that is a tool call is done, not read out",
    ask.indexOf("var wants = toolRead(answer)") > -1, true);
  t("and it is not read out while it is still arriving",
    ask.indexOf("is not something to read out loud") > -1, true);
  const doing = grab("doTheThing");
  t("the tool is actually run", doing.indexOf("toolRun(call)") > -1, true);
  t("what happened is written down", doing.indexOf("hudLog") > -1, true);
  t("and goes back to him to put into words",
    doing.indexOf("What happened: ") > -1, true);
  t("he is told not to reach for another tool in that breath",
    doing.indexOf("Do not use a tool now") > -1, true);
  t("if he cannot be reached the plain result is said anyway",
    doing.indexOf("carryOn(plain)") > -1, true);
  t("and it ends listening, like any other answer",
    doing.indexOf("carryOn()") > -1, true);
  t("he is told what he can do", has("toolsBlock(lastUserText)"), true);
  const block = grab("toolsBlock");
  t("and told plainly what he cannot finish alone",
    block.indexOf("no app on iOS can") > -1, true);
  t("and to use words for questions",
    block.indexOf("answer questions with words") > -1, true);

  /* The list is long, and it used to be sent with every single question - which
     is the one thing that should be quickest. It only goes when the words are
     asking for something to be done. */
  const asksForDoing = new Function("TOOLS",
    decl("DOING_PLAIN") + String.fromCharCode(10) +
    "var doingRe = null;" + String.fromCharCode(10) +
    grab("doingPattern") + String.fromCharCode(10) +
    grab("looksLikeDoing") + " return looksLikeDoing;")(TOOLS);
  ["text mum I am late", "call dad", "open safari", "put the dentist in my calendar",
   "remind me to take the bins out", "set a timer for five minutes",
   "search for train times", "play some music", "email the school",
   "book a table", "run my morning shortcut", "take me to the station"]
    .forEach(x => t('"' + x + '" gets the tools', asksForDoing(x), true));
  ["what is the capital of france", "why is the sky blue", "tell me a joke",
   "how tall is everest", "who wrote hamlet", "what is a diode"]
    .forEach(x => t('"' + x + '" does not need them', asksForDoing(x), false));
  t("and the list is only built when it is wanted",
    grab("toolsBlock").indexOf("if(arguments.length && !looksLikeDoing(text)) return") > -1, true);
}

/* ---- every tool can actually be reached ---- */
{
  /* "What is the weather in the UAE" got 28 degrees when it was 44 there - he
     never called the tool, because the words that offer him the tools were
     hand-written and had no weather in them. They come from the tools now. */
  const reach = new Function("TOOLS",
    decl("DOING_PLAIN") + "\n" +
    "var doingRe = null;\n" +
    grab("doingPattern") + grab("looksLikeDoing") + " return looksLikeDoing;")(TOOLS);

  const reachable = [
    ["weather", "what is the weather in the uae"],
    ["weather", "how hot is it outside"],
    ["weather", "will it rain today"],
    ["maths", "what is 17 percent of 340"],
    ["maths", "whats 45 times 12"],
    ["convert", "how many km is 5 miles"],
    ["convert", "convert 10 kg to pounds"],
    ["notes", "what are my notes"],
    ["file", "read this file"],
    ["code", "what does this javascript do"],
    ["contact", "what is mums number"],
    ["directions", "how do i get to the station"],
    ["search", "search for train times"],
    ["calendar", "put the dentist in my calendar"],
    ["timer", "set a timer for five minutes"],
    ["call", "call dad"],
    ["text", "text mum i am late"],
    ["remind", "remind me to take the bins out"]
  ];
  reachable.forEach(function(pair){
    t(pair[0] + " can be reached by asking plainly", reach(pair[1]), true);
  });

  t("and a plain question still costs nothing extra",
    ["why is the sky blue", "who wrote hamlet", "what is a diode"]
      .every(function(q){ return !reach(q); }), true);

  /* the thing that made this possible to get wrong: a hand-written list */
  t("every tool says what words reach it",
    Object.keys(TOOLS).every(function(k){ return TOOLS[k].words && TOOLS[k].words.length; }), true);
  t("and the pattern is built from them, not written by hand",
    grab("doingPattern").indexOf("TOOLS[name].words") > -1, true);
}

/* ---- the phone's side ---- */
{
  const sw = fs.readFileSync("native/PedroNative.swift", "utf8");
  ["calendarAdd", "reminderAdd", "contactFind"].forEach(m => {
    t(m + " is offered to the app", sw.indexOf('CAPPluginMethod(name: "' + m + '"') > -1, true);
    t(m + " is written", sw.indexOf("@objc func " + m + "(") > -1, true);
  });
  t("the calendar is asked for properly on new phones",
    sw.indexOf("requestWriteOnlyAccessToEvents") > -1, true);
  t("and on older ones", sw.indexOf("requestAccess(to: .event)") > -1, true);
  t("reminders too", sw.indexOf("requestFullAccessToReminders") > -1, true);
  t("contacts are asked for", sw.indexOf("requestAccess(for: .contacts)") > -1, true);
  t("a refusal says where to turn it on", sw.indexOf("turn it on in Settings") > -1, true);
  t("only a handful of matches come back", sw.indexOf("found.count >= 6") > -1, true);
  t("dates are read as local time, which is what people say",
    sw.indexOf("yyyy-MM-dd'T'HH:mm") > -1, true);

  const wf = fs.readFileSync(".github/workflows/build-ios.yml", "utf8");
  ["NSCalendarsUsageDescription", "NSRemindersUsageDescription", "NSContactsUsageDescription"]
    .forEach(k => t(k + " is declared, or the phone ends the app", wf.indexOf(k) > -1, true));
  t("and they are checked after the build",
    wf.indexOf("NSCalendarsUsageDescription NSRemindersUsageDescription NSContactsUsageDescription") > -1, true);
}

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " doing-things tests passed");
process.exit(fail ? 1 : 0);
