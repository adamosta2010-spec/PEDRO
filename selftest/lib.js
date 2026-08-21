/* Pulling functions and declarations out of the page.
   Counting braces by hand does not work: braces live inside strings ("{"),
   inside regexes (/x{6}/), and quotes live inside regexes too (/["]/), so every
   scanner I wrote eventually mistook one for another and swallowed half the
   file. So no scanning - offer the engine successively longer slices and let it
   say which one is whole. It is the same parser that will run the code, so it
   cannot disagree with it. */

function endsWith(src, from, closer, wrap){
  for(let k = from; k < src.length; k++){
    if(src[k] !== closer) continue;
    const candidate = src.slice(from, k + 1);
    try{
      new Function(wrap(candidate));
      return candidate;
    }catch(e){ /* not whole yet - keep going */ }
  }
  return null;
}

/* "var X =", "var X  =", "var X=" - all the same declaration */
function findDecl(src, name){
  let at = 0;
  for(;;){
    const i = src.indexOf("var " + name, at);
    if(i < 0) return -1;
    let k = i + 4 + name.length;
    while(k < src.length && (src[k] === " " || src[k] === "\t")) k++;
    if(src[k] === "=" && src[k + 1] !== "=") return i;
    at = i + 1;
  }
}

function reader(src){
  const cache = {};
  function grab(name){
    if(cache["f:" + name]) return cache["f:" + name];
    const i = src.indexOf("function " + name + "(");
    if(i < 0) throw new Error("no such function: " + name);
    const found = endsWith(src, i, "}", c => "return " + c);
    if(!found) throw new Error("could not find the end of: " + name);
    cache["f:" + name] = found;
    return found;
  }
  function decl(name){
    if(cache["v:" + name]) return cache["v:" + name];
    const i = findDecl(src, name);
    if(i < 0) throw new Error("no declaration: " + name);
    const found = endsWith(src, i, ";", c => c);
    if(!found) throw new Error("unterminated: " + name);
    cache["v:" + name] = found;
    return found;
  }
  return { grab: grab, decl: decl };
}

module.exports = { reader: reader };
