import IInput from "./IInput";

// Only well-formed JS identifiers are allowed as parameter names. This
// prevents a malicious/unexpected input key (e.g. containing `=`, `(`, `,`)
// from being spliced into the generated function source and used to inject
// arbitrary code via a crafted default-parameter expression.
const identifierRegx = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// `Function(tmp)` compiles a brand-new function from source every time it is
// called. Templates are typically evaluated many times with the exact same
// `code`/key-shape combination (e.g. the same `{expr}` inside a `<for>` body
// is re-evaluated once per loop iteration, the same `<case>` header is
// re-evaluated once per sibling case). Caching the compiled `Function` by
// its generated source avoids re-parsing/re-compiling identical code on
// every iteration. The cache is capped and evicted LRU-style so long-running
// processes rendering many distinct templates don't grow this unbounded.
const COMPILED_FN_CACHE_LIMIT = 500;
const compiledFnCache = new Map<string, (this: any) => any>();

function getCompiledFn(tmp: string): (this: any) => any {
  const cached = compiledFnCache.get(tmp);
  if (cached) {
    // Refresh recency for simple LRU behavior.
    compiledFnCache.delete(tmp);
    compiledFnCache.set(tmp, cached);
    return cached;
  }

  const fn = Function(tmp) as (this: any) => any;

  if (compiledFnCache.size >= COMPILED_FN_CACHE_LIMIT) {
    const oldestKey = compiledFnCache.keys().next().value;
    if (oldestKey !== undefined) compiledFnCache.delete(oldestKey);
  }
  compiledFnCache.set(tmp, fn);

  return fn;
}

function evaluate(code: string, input?: IInput): any {
  if (!code) return "";

  const keys = input ? Object.keys(input) : [];
  if (keys.some((key) => !identifierRegx.test(key))) {
    return null;
  }

  const tmp = `return ((${keys.join(
    ","
  )}) => ${code}).apply(null, Object.values(this))`;

  try {
    return getCompiledFn(tmp).call(input);
  } catch {
    return null;
  }
}

export default evaluate;
