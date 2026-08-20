/* Guard against damage this project keeps suffering: something between the
   editor and the file eating the backslash out of a regex. "\s+$" quietly
   becomes "s+$", which strips the letter s instead of spaces, and nothing
   looks wrong until words come out mangled. Unterminated strings are already
   caught by node --check, so this only looks for lost escapes.
   Written with no literal backslashes at all, for obvious reasons. */
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const B = String.fromCharCode(92);
const LF = String.fromCharCode(10);

const src = (html.match(new RegExp("<script>([" + B + "s" + B + "S]*?)</script>")) || [, ""])[1];

let fail = 0;
const lines = src.split(LF);
const litRe = new RegExp("/(?:" + B + B + "." + "|[^/" + B + "n" + B + B + "])+/[gimsuy]*", "g");
const hasEscape = new RegExp(B + B + "[sdwbSDWBnrt.]");
const suspects = [
  { pat: "(^|[^A-Za-z0-9_])s[+*]", why: B + "s" },
  { pat: "(^|[^A-Za-z0-9_])d[+*]", why: B + "d" },
  { pat: "(^|[^A-Za-z0-9_])w[+*]", why: B + "w" }
].map(s => ({ re: new RegExp(s.pat), why: s.why }));

lines.forEach(function(line, i){
  const t = line.trim();
  if(t.indexOf("//") === 0 || t.indexOf("*") === 0 || t.indexOf("/*") === 0) return;
  const found = line.match(litRe);
  if(!found) return;
  found.forEach(function(lit){
    if(hasEscape.test(lit)) return;
    suspects.forEach(function(s){
      if(!s.re.test(lit)) return;
      fail++;
      console.log("FAIL line " + (i + 1) + ": looks like " + s.why + " with the backslash eaten");
      console.log("      " + t.slice(0, 110));
    });
  });
});

console.log(fail ? LF + fail + " MANGLED REGEX(ES)" : "No mangled escapes");
process.exit(fail ? 1 : 0);
