#!/usr/bin/env bash
# Static checks for index.html - run from the project folder: bash selftest/run.sh
set -e
cd "$(dirname "$0")/.."
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");
fs.writeFileSync("selftest/_app.js", h.match(/<script>([\s\S]*?)<\/script>/)[1]);'
node --check selftest/_app.js && echo "syntax ok"
node selftest/boot.js
node selftest/checkui.js  | tail -1
node selftest/layers.js | tail -1
node selftest/test.js  selftest/_app.js | tail -1
node selftest/test2.js selftest/_app.js | tail -1
node selftest/test3.js selftest/_app.js | tail -1
node selftest/test4.js selftest/_app.js | tail -1
node selftest/test5.js selftest/_app.js | tail -1
node selftest/test6.js selftest/_app.js | tail -1
node selftest/test7.js selftest/_app.js | tail -1
rm -f selftest/_app.js
