/* What gets installed on the phone is dist/index.html, not the index.html I
   edit. Build 64 shipped build 63's app because nothing kept those two in
   step. This refuses to let that happen quietly again. */
const fs = require("fs");
let fail = 0, pass = 0;
const t = (n, ok) => {
  if(ok){ pass++; console.log("ok   " + n); }
  else { fail++; console.log("FAIL " + n); }
};

const root = fs.readFileSync("index.html", "utf8");
const dist = fs.existsSync("dist/index.html") ? fs.readFileSync("dist/index.html", "utf8") : "";
const stamp = s => ((s.match(/var BUILD = "([^"]*)"/) || [])[1] || "none");

t("there is an app in dist to package", dist.length > 0);
t("it is the same app as the one being edited (" + stamp(root) + ")", root === dist);
if(root !== dist){
  console.log("     root is " + stamp(root) + ", dist is " + stamp(dist) +
              " - run: cp index.html dist/index.html");
}

/* and the build does the copy itself, so a forgotten copy cannot ship */
const wf = fs.readFileSync(".github/workflows/build-ios.yml", "utf8");
t("the build copies the app into dist rather than trusting the commit",
  wf.indexOf("cp index.html dist/index.html") > -1);
t("and it checks the copy took", wf.indexOf("cmp -s index.html dist/index.html") > -1);

console.log(fail ? "\n" + fail + " FAILURES" : "\nAll " + pass + " shipping checks passed");
process.exit(fail ? 1 : 0);
