#!/usr/bin/env bash
# Static checks for index.html - run from the project folder: bash selftest/run.sh
# a failing suite must fail the run - without pipefail the pipe to tail
# swallows the exit code and everything looks green
set -eo pipefail
cd "$(dirname "$0")/.."
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");
fs.writeFileSync("selftest/_app.js", h.match(/<script>([\s\S]*?)<\/script>/)[1]);'
node --check selftest/_app.js && echo "syntax ok"
node selftest/escapes.js | tail -1
node selftest/shipped.js | tail -1
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
# the workbench needs the page itself - it checks the board markup too
node selftest/test8.js index.html | tail -1
node selftest/test9.js index.html | tail -1
node selftest/test11.js index.html | tail -1
node selftest/test12.js index.html | tail -1
node selftest/test13.js index.html | tail -1
node selftest/test14.js index.html | tail -1
node selftest/test15.js index.html | tail -1
node selftest/test16.js index.html | tail -1
node selftest/test10.js index.html | tail -1
rm -f selftest/_app.js
