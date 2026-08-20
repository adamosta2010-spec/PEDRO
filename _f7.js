/* A fixed-length slice breaks the moment the function grows. Match braces. */
const fs = require("fs");
const f = "selftest/test4.js";
let s = fs.readFileSync(f, "utf8");
const LF = String.fromCharCode(10);
const old = [
"  const syncSrc = (() => {",
"    const i = src2.indexOf(\"function syncProviderUI(\");",
"    return src2.slice(i, i + 2000);",
"  })();"
].join(LF);
const neu = [
"  const syncSrc = (() => {",
"    /* the whole function, however long it grows - a fixed slice used to cut",
"       the end off and fail for no real reason */",
"    const i = src2.indexOf(\"function syncProviderUI(\");",
"    let d = 0;",
"    for(let k = src2.indexOf(\"{\", i); k < src2.length; k++){",
"      if(src2[k] === \"{\") d++;",
"      else if(src2[k] === \"}\"){ d--; if(!d) return src2.slice(i, k + 1); }",
"    }",
"    return src2.slice(i);",
"  })();"
].join(LF);
const p = s.split(old);
if(p.length !== 2){ console.error("no match (" + (p.length - 1) + ")"); process.exit(1); }
fs.writeFileSync(f, p.join(neu));
console.log("test4 now reads the whole function");
