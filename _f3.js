const fs = require("fs");
const f = "selftest/test7.js";
let s = fs.readFileSync(f, "utf8");
const bad = 'grab("runningWhere") + "\n" +  + grab("micProblem")';
const good = 'grab("runningWhere") + ";" + grab("micProblem")';
const p = s.split(bad);
if(p.length !== 2){ console.error("no match (" + (p.length - 1) + ")"); process.exit(1); }
fs.writeFileSync(f, p.join(good));
console.log("joined the two functions properly");
