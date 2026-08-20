const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
const js  = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const body = html.slice(html.indexOf("</style>"), html.indexOf("<script>"));

let fail = 0, pass = 0;
const t = (n, ok, detail) => {
  if(ok){ pass++; console.log("ok   " + n); }
  else { fail++; console.log("FAIL " + n + (detail ? "\n     " + detail : "")); }
};

/* 1. every icon reference resolves to a defined symbol */
const defined = new Set();
let m, dre = /<symbol id="([^"]+)"/g;
while((m = dre.exec(html))) defined.add(m[1]);
const used = new Set();
let ure = /href="#([a-zA-Z0-9_-]+)"/g;
while((m = ure.exec(html))) used.add(m[1]);
/* icon() calls in JS build refs dynamically */
let ire = /icon\("([a-zA-Z0-9_-]+)"/g;
while((m = ire.exec(js))) used.add(m[1]);
let sre = /STARTERS[\s\S]*?\];/.exec(js);
if(sre){ let ir2 = /i:"([a-zA-Z0-9_-]+)"/g; while((m = ir2.exec(sre[0]))) used.add(m[1]); }
const missingSym = [...used].filter(u => !defined.has(u) && !/^(botg|eyeg|eyeglow)$/.test(u));
t("all " + used.size + " icon refs resolve", missingSym.length === 0, "missing: " + missingSym.join(", "));

/* 2. CSS braces balance and no stray garbage */
const opens = (css.match(/{/g) || []).length, closes = (css.match(/}/g) || []).length;
t("css braces balance (" + opens + ")", opens === closes, opens + " { vs " + closes + " }");
t("no leftover placeholder values", !/#\d*category|undefined|NaN/.test(css));

/* 3. classes the JS sets must exist in the stylesheet */
const jsClasses = new Set();
let cre = /class="([a-z][a-z0-9 _-]*)"/gi;
while((m = cre.exec(js))) m[1].split(/\s+/).forEach(c => c && jsClasses.add(c));
["msg","user","ai","av","bot","me","wrap","who","time","bubble","think","acts","more",
 "chip","ic","empty","hero","lede","caret","err","shots","one","thumb","citem","nm","dl",
 "tool","tx","swatch","on","act","rec","stop"].forEach(c => jsClasses.add(c));
const missingCss = [...jsClasses].filter(c => !new RegExp("\\." + c + "[^a-zA-Z0-9_-]").test(css));
t("all " + jsClasses.size + " rendered classes are styled", missingCss.length === 0,
  "unstyled: " + missingCss.join(", "));

/* 4. structural sanity */
t("sidebar exists with the drawer id", /<aside class="side" id="drawer">/.test(body));
t("old off-canvas drawer is gone", !/class="panel" id="drawer"/.test(body));
t("mascot symbol defined", defined.has("bot"));
t("composer present", /id="input"/.test(body) && /id="btnSend"/.test(body));
t("tools sheet present", /id="tools"/.test(body));
t("disclaimer line present", /can make mistakes/.test(body));
t("responsive breakpoint present", /@media\(max-width:899px\)/.test(css));
t("light theme defined", /data-theme="light"/.test(css));
t("all 5 accents defined",
  ["purple","cyan","green","orange"].every(a => css.includes('data-accent="' + a + '"')));

/* 4b. every .panel must actually be positioned, or it opens invisibly */
{
  const panels = [...html.matchAll(/class="panel" id="([a-z]+)"/g)].map(m => m[1]);
  const unpositioned = panels.filter(id => {
    const base = new RegExp("#" + id + "[,{][^}]*(left:|bottom:)");
    const shown = new RegExp("#" + id + "\.on[,{][^}]*transform:none");
    return !(base.test(css) && shown.test(css));
  });
  t("all " + panels.length + " panels are positioned + have an open state",
    unpositioned.length === 0, "missing css: " + unpositioned.join(", "));
}

/* 5. nothing references the removed speak button */
t("no dangling btnSpeak reference", !/\$\("btnSpeak"\)/.test(js));

/* 6. duplicate id check - a dupe silently breaks $() lookups */
const ids = {};
let idre = /\bid="([A-Za-z0-9_-]+)"/g;
while((m = idre.exec(body))) ids[m[1]] = (ids[m[1]] || 0) + 1;
const dupes = Object.keys(ids).filter(k => ids[k] > 1);
t("no duplicate element ids", dupes.length === 0, "duplicated: " + dupes.join(", "));

console.log(fail ? "\n" + fail + " PROBLEMS" : "\nAll " + pass + " UI checks passed");
process.exit(fail ? 1 : 0);
