/* The app's window is built from Main.storyboard, which points at Capacitor's
   own view controller. Point it at ours instead, so the plugin gets registered
   before the web app loads. */
const fs = require("fs");
const p = "ios/App/App/Base.lproj/Main.storyboard";
if(!fs.existsSync(p)){ console.error("no storyboard at " + p); process.exit(1); }
let s = fs.readFileSync(p, "utf8");

if(s.indexOf('customClass="MainViewController"') > -1){
  console.log("the storyboard already points at MainViewController");
  process.exit(0);
}

const before = s;
s = s.split('customClass="CAPBridgeViewController"').join('customClass="MainViewController"');
s = s.split('customModule="Capacitor"').join('customModule="App" customModuleProvider="target"');

if(s === before){
  console.error("could not find Capacitor's view controller in the storyboard.");
  console.error("--- storyboard follows so the next build can be aimed properly ---");
  console.error(before);
  process.exit(1);
}

fs.writeFileSync(p, s);
const check = fs.readFileSync(p, "utf8");
if(check.indexOf('customClass="MainViewController"') < 0){
  console.error("the change did not stick"); process.exit(1);
}
console.log("the storyboard now loads MainViewController");
