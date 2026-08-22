/* Layering guard.
   The menu opening underneath the dark overlay wasn't a z-index typo - the
   numbers were right. A parent of the drawer had its own z-index, which made
   it a stacking context, so the drawer's 31 was only ever compared with its
   siblings and never with the scrim's 30 outside. These checks read the real
   stylesheet and markup, so that class of bug fails here instead of on a phone. */
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");

let fail = 0;
function t(name, got, want){
  const ok = got === want;
  if(!ok) fail++;
  console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}

/* ---- the stylesheet ---- */
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [,""])[1];

/* every declaration block for a selector, in source order */
function blocksFor(sel){
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while((m = re.exec(css))){
    const selectors = m[1].split(",").map(s => s.trim());
    if(selectors.some(s => s === sel || s.endsWith(" " + sel))) out.push(m[2]);
  }
  return out;
}
function lastValue(sel, prop){
  let v = null;
  for(const block of blocksFor(sel)){
    block.split(";").forEach(function(decl){
      const i = decl.indexOf(":");
      if(i < 0) return;
      if(decl.slice(0, i).trim() === prop) v = decl.slice(i + 1).trim();
    });
  }
  return v;
}

/* ---- who wraps the drawer ---- */
const VOID = new Set(["area","base","br","col","embed","hr","img","input","link",
                      "meta","param","source","track","wbr","use","path","circle",
                      "rect","stop","polygon","line","ellipse"]);
function ancestorsOf(idAttr){
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while((m = re.exec(html))){
    const closing = m[1] === "/", tag = m[2].toLowerCase(), attrs = m[3], self = m[4] === "/";
    if(tag === "style" || tag === "script"){
      /* skip the body of these - their text can look like markup */
      const end = html.indexOf("</" + tag + ">", re.lastIndex);
      if(end > -1 && !closing) re.lastIndex = end;
      continue;
    }
    if(closing){ 
      for(let i = stack.length - 1; i >= 0; i--){
        if(stack[i].tag === tag){ stack.length = i; break; }
      }
      continue;
    }
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
    const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1] || "";
    if(id === idAttr) return stack.slice();
    if(!VOID.has(tag) && !self) stack.push({ tag: tag, id: id, cls: cls });
  }
  return null;
}

const chain = ancestorsOf("drawer");
t("the drawer's ancestors can be found", Array.isArray(chain), true);
const names = (chain || []).map(e => e.tag + (e.id ? "#" + e.id : "") + (e.cls ? "." + e.cls.split(/\s+/).join(".") : ""));
console.log("     drawer sits inside: " + names.join(" > "));
t("the drawer is inside .app", names.some(n => n.indexOf(".app") > -1), true);

/* ---- no ancestor may open a stacking context of its own ---- */
/* anything here would re-scope the drawer's z-index and hide it under the scrim */
const TRAPS = ["filter", "backdrop-filter", "transform", "perspective", "isolation",
               "will-change", "mix-blend-mode", "contain", "opacity"];
(chain || []).forEach(function(el){
  const sels = [];
  if(el.id) sels.push("#" + el.id);
  el.cls.split(/\s+/).filter(Boolean).forEach(c => sels.push("." + c));
  if(!sels.length) sels.push(el.tag);
  sels.forEach(function(sel){
    const pos = lastValue(sel, "position");
    const z   = lastValue(sel, "z-index");
    const positioned = pos && pos !== "static";
    t(sel + " does not scope z-index away from the drawer",
      !(positioned && z && z !== "auto"), true);
    TRAPS.forEach(function(prop){
      const v = lastValue(sel, prop);
      const trapped = v !== null &&
        !(prop === "opacity" && parseFloat(v) >= 1) &&
        !(prop === "isolation" && v === "auto") &&
        !(prop === "will-change" && v === "auto") &&
        !(prop === "contain" && /^(none|size)$/.test(v)) &&
        !(prop === "mix-blend-mode" && v === "normal");
      t(sel + " has no " + prop + " to trap the drawer under the overlay", !trapped, true);
    });
  });
});

/* ---- and the numbers themselves still have to be right ---- */
const zScrim  = parseInt(lastValue(".scrim", "z-index"), 10);
const zSide   = parseInt(lastValue(".side", "z-index"), 10);
const zPanel  = parseInt(lastValue(".panel", "z-index"), 10);
const zLock   = parseInt(lastValue("#lock", "z-index"), 10);
const zHF     = parseInt(lastValue("#hf", "z-index"), 10);
const zBanner = parseInt(lastValue("#banner", "z-index"), 10);

t("the drawer sits above the overlay", zSide > zScrim, true);
t("the panels sit above the overlay", zPanel > zScrim, true);
t("sign-in covers everything below it", zLock > zPanel && zLock > zSide, true);
/* the panels have to be reachable from every full-screen view */
t("settings opens above the dashboard", zPanel > zHF, true);
t("and above an explanation", zPanel > parseInt(lastValue("#viz", "z-index"), 10), true);
t("the dashboard still covers the chat", zHF > 31, true);

/* the overlay has to be reachable to be dismissable */
t("tapping the overlay closes what's open", /scrim\.addEventListener\("click", closePanels\)/.test(html), true);
t("the overlay only takes taps while it's on", /\.scrim\.on\{[^}]*pointer-events:auto/.test(css), true);
t("the overlay ignores taps otherwise", /\.scrim\{[^}]*pointer-events:none/.test(css), true);

console.log(fail ? "\n" + fail + " LAYERING CHECK(S) FAILED" : "\nAll layering checks passed");
process.exit(fail ? 1 : 0);
