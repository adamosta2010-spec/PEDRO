/* The web app is plain HTML with no bundler, so nothing ever pulled in
   @capacitor/core. The native side still injects a bare window.Capacitor, which
   is why the app looked like it was running fine while every native call was
   unreachable - Plugins and registerPlugin live in the JavaScript package, not
   in the injected bridge. Copy it in next to the page and link it first. */
const fs = require("fs");
const path = require("path");

const pub = "ios/App/App/public";
if(!fs.existsSync(pub)){ console.error("no web assets at " + pub); process.exit(1); }

const candidates = [
  "node_modules/@capacitor/core/dist/capacitor.js",
  "node_modules/@capacitor/core/dist/capacitor.cjs.js"
];
const src = candidates.find(p => fs.existsSync(p));
if(!src){
  console.error("cannot find Capacitor's browser build. Looked in:");
  candidates.forEach(c => console.error("  " + c));
  process.exit(1);
}

fs.copyFileSync(src, path.join(pub, "capacitor.js"));
console.log("copied " + src + " -> " + pub + "/capacitor.js");

const page = path.join(pub, "index.html");
let h = fs.readFileSync(page, "utf8");
if(h.indexOf('src="capacitor.js"') > -1){
  console.log("the page already links it");
} else {
  const i = h.indexOf("<script>");
  if(i < 0){ console.error("no script tag to insert before"); process.exit(1); }
  h = h.slice(0, i) + '<script src="capacitor.js"></script>' +
      String.fromCharCode(10) + h.slice(i);
  fs.writeFileSync(page, h);
  console.log("linked capacitor.js before the app's own script");
}

/* prove it, rather than assume it */
const check = fs.readFileSync(page, "utf8");
if(check.indexOf('src="capacitor.js"') < 0){ console.error("the link did not stick"); process.exit(1); }
const js = fs.readFileSync(path.join(pub, "capacitor.js"), "utf8");
if(js.indexOf("registerPlugin") < 0){ console.error("that file has no registerPlugin in it"); process.exit(1); }
console.log("capacitor.js is in place and provides registerPlugin");
