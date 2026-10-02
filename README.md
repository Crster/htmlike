# @crster/htmlike

A lightweight, dependency-free HTML template engine for Node.js and Express, with
support for expressions, loops, conditionals, layouts/blocks, and safe-by-default
output escaping.

- **Zero runtime dependencies**
- **Express-compatible view engine**
- Plain JavaScript expressions inside `{ }`
- Loops (`<for>`), conditionals (`<switch>/<case>`), layouts (`<view>`), and
  reusable named regions (`<block>`)
- Correctly handles **nested and sibling control tags** (loops inside
  switches, switches inside loops, blocks inside blocks, etc.)
- HTML-escaped output by default, with an explicit raw opt-out
- Compiled-expression caching for fast repeated rendering (e.g. inside loops)

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Plain Node.js](#plain-nodejs)
  - [Express](#express)
- [Template Syntax](#template-syntax)
  - [Expressions](#expressions)
  - [Escaping & Raw Output](#escaping--raw-output)
  - [Escaping a Literal Brace](#escaping-a-literal-brace)
  - [Loops (`<for>`)](#loops-for)
  - [Conditionals (`<switch>` / `<case>`)](#conditionals-switch--case)
  - [Whitelisted Tags (`<script>`, `<style>`, `<pre>`, `<noscript>`)](#whitelisted-tags)
  - [Layouts & Blocks (`<view>` / `<block>`)](#layouts--blocks-view--block)
- [Nesting & Composition](#nesting--composition)
- [API Reference](#api-reference)
- [Security Model](#security-model)
- [Performance](#performance)
- [Development](#development)

---

## Installation

```sh
npm install @crster/htmlike
```

## Quick Start

### Plain Node.js

```js
const htmlike = require("@crster/htmlike");

const output = htmlike.render("<p>Hello {world}</p>", { world: "Template engine" });
// => <p>Hello Template engine</p>
```

`render(template, data)` accepts either a plain string, or a template
descriptor object when you need file-based `<view>`/`<block>` resolution:

```js
const output = htmlike.render(
  {
    currentWorkingDirectory: "./views", // base directory for <view {name}> lookups
    defaultFileExtension: "html",       // extension appended when a view has none
    template: "<view {layout}>...</view>",
  },
  data
);
```

### Express

```js
const express = require("express");
const htmlike = require("@crster/htmlike");

const app = express();

app.engine("html", htmlike.expressViewEngine);
app.set("view engine", "html");
app.set("views", "./src/views");

app.get("/", (req, res) => {
  res.render("home", { title: "Welcome" }); // renders ./src/views/home.html
});
```

---

## Template Syntax

### Expressions

Anything inside single braces `{ }` is evaluated as a JavaScript expression,
with your data object's keys available as local variables:

```html
<p>One + Two = {1 + 2}</p>
<p>Hello {world}</p>
<p>{user.name.toUpperCase()}</p>
```

Given `{ world: "Hello", hello: "World" }`:

```html
<p>{world} {hello}</p>
<!-- <p>Hello World</p> -->
```

If an expression throws or references an undefined variable, it silently
renders as empty rather than crashing the whole template.

### Escaping & Raw Output

Expression values are **HTML-escaped by default** — this protects you from
XSS when rendering user-supplied data:

```js
htmlike.render("<p>{name}</p>", { name: "<img src=x onerror=alert(1)>" });
// => <p>&lt;img src=x onerror=alert(1)&gt;</p>
```

If you have **trusted, pre-sanitized** HTML you intentionally want to inject
as-is, opt out of escaping with triple braces:

```js
htmlike.render("<p>{{{trustedHtml}}}</p>", { trustedHtml: "<b>bold</b>" });
// => <p><b>bold</b></p>
```

Only use `{{{ }}}` for content you control or have already sanitized —
never for raw, untrusted user input.

### Escaping a Literal Brace

To render a literal `{...}` without it being evaluated as an expression,
wrap it in double braces:

```html
<p>use this {{"Hello"}}</p>
<!-- <p>use this {Hello}</p> -->
```

### Loops (`<for>`)

```html
<ul>
  <for {animal of animals}>
    <li>{animal.name} says {animal.sound}</li>
  </for>
</ul>
```

Given `{ animals: [{ name: "Dog", sound: "Roff" }, { name: "Cat", sound: "Meow" }] }`,
renders one `<li>` per array item. If the expression doesn't evaluate to a
non-empty array, the loop renders nothing. Sibling `<for>` loops and nested
`<for>` loops (loops inside loops) are both fully supported — see
[Nesting & Composition](#nesting--composition).

### Conditionals (`<switch>` / `<case>`)

`<switch {expr}>` evaluates `expr` once, then renders the body of whichever
`<case {value}>` matches (`===` comparison). An empty `<case {}>` acts as the
default/fallback:

```html
<switch {users.length}>
  <case {0}><p>No result found</p></case>
  <case {1}><p>The chosen one</p></case>
  <case {5}><p>The best five</p></case>
  <case {}><p>This is switch default</p></case>
</switch>
```

This also gives you if/else-style branching:

```html
<switch {!!user}>
  <case {true}><p>User is not null</p></case>
  <case {false}><p>User is null</p></case>
</switch>
```

### Whitelisted Tags

`<script>`, `<noscript>`, `<style>`, and `<pre>` bodies are **not** treated as
template markup — single braces `{ }` inside them are left alone (so they
don't collide with JS object literals or CSS). To render an expression inside
one of these tags, use double braces `{{ }}`:

```html
<script>
  let name = "John";
  let alias = `${name}-{{name}}`;
</script>
```

With `{ name: "Doe" }`, renders:

```html
<script>
  let name = "John";
  let alias = `${name}-Doe`;
</script>
```

### Layouts & Blocks (`<view>` / `<block>`)

`<view {name}>` loads and renders another template file (resolved relative to
`currentWorkingDirectory`, using `defaultFileExtension` if `name` has no
extension) and injects the current template's content into it via named
`<block>` regions.

**`layout.html`** (defines the regions a page can fill in):

```html
<html>
  <head>
    <block {css}>
      <style>body { color: blue; }</style>
    </block>
  </head>
  <body>
    <block {body}/>
    <block {footer}/>
  </body>
</html>
```

**`page.html`** (extends the layout):

```html
<view {layout}>
  <block {css}>
    <style>body { color: red; }</style>
  </block>

  <block {body}>
    <p>Markup goes here!</p>
  </block>
</view>
```

Content outside any named `<block>` inside a `<view>` is implicitly treated
as the `body` block. Any `<view>`/`<block>` without a matching counterpart in
the layout is silently dropped, so you can define optional regions.

**Passing arguments to a view**, evaluated as a JS object literal and merged
into that view's data:

```html
<view {layout({ title: "Earth" })}>
  ...
</view>
```

```html
<!-- inside layout.html -->
<h1>{title}</h1>
```

**Self-closing shorthand** — `<block {name}/>` and `<view {name}/>` are valid
when there's no body/children to pass (as used for `<block {body}/>` above,
or to embed a sub-view with no content: `<view {sub}/>`).

---

## Nesting & Composition

`<view>`, `<block>`, `<switch>`, and `<for>` can be freely mixed, nested
inside each other, and repeated as siblings — each tag is resolved
independently with the correct scope, regardless of ordering or depth:

```html
<!-- Sibling loops render independently -->
<for {x of a}>A:{x} </for><for {x of b}>B:{x} </for>

<!-- Nested loops -->
<for {group of groups}>
  <for {item of group.items}>{item}</for>
</for>

<!-- Switch nested inside a case -->
<switch {1}>
  <case {1}>
    <switch {2}>
      <case {2}>inner</case>
    </switch>
  </case>
</switch>

<!-- Switch nested inside a for loop, with correct per-iteration scope -->
<for {n of items}>
  <switch {n % 2}>
    <case {0}>{n}:even</case>
    <case {1}>{n}:odd</case>
  </switch>
</for>
<!-- 1:odd2:even3:odd4:even -->

<!-- Named blocks nested inside other named blocks -->
<view {layout}>
  <block {body}>
    Outer-Start
    <block {inner}>Inner-Content</block>
    Outer-End
  </block>
</view>
```

---

## API Reference

### `htmlike.render(template, data?)`

| Parameter  | Type                     | Description |
|------------|--------------------------|--------------|
| `template` | `string \| ITemplate`    | A raw template string, or `{ currentWorkingDirectory, defaultFileExtension?, template }` when the template uses `<view>`/`<block>` file includes. |
| `data`     | `object` (optional)      | Values made available to `{ }` expressions by key. Keys must be valid JS identifiers (see [Security Model](#security-model)). |

Returns the rendered HTML `string`. Never throws — evaluation errors inside
an individual `{expr}` render as empty; a fatal template error is rendered as
`<pre>{message}</pre>` instead of raising.

### `htmlike.expressViewEngine(filePath, options, callback)`

Standard Express view-engine signature (`app.engine(ext, callback)`). Reads
the file, pulls renderable locals out of Express' `options` (excluding
internal fields like `_locals`/`cache`/`settings`), and resolves `views`/
`view engine` settings as `currentWorkingDirectory`/`defaultFileExtension`.

---

## Security Model

- **Templates must be trusted.** Template source (`.html` files and strings
  passed to `render()`) is parsed and its `{ }` expressions are evaluated as
  JavaScript. Never construct a template string from untrusted/user input —
  only render templates you or your team authored.
- **Data is safe.** The second `render()` argument is treated purely as data,
  never as code. Its values are HTML-escaped automatically unless you
  explicitly opt out with `{{{ }}}` (see [Escaping & Raw Output](#escaping--raw-output)).
- **Malformed data keys are rejected.** Keys of the `data` object must be
  valid JavaScript identifiers; anything else (e.g. a key engineered to break
  out of the generated expression scope) causes that expression to safely
  evaluate to `null` instead of executing injected code.

---

## Performance

- Expression evaluation (`evaluate()`) caches compiled functions by source,
  so re-evaluating the same `{expr}` across loop iterations or repeated
  `<case>` checks doesn't recompile JavaScript each time.
- All tag-matching regular expressions are compiled once at module load and
  reused across renders/recursion, instead of being rebuilt on every call.
- Control tags (`<view>`/`<block>`/`<switch>`/`<for>`) are resolved via a
  single position-ordered scan rather than multiple whole-template passes,
  so nested tags are only ever matched once.

---

## Development

```sh
npm install      # install dependencies
npm run build    # compile TypeScript (tsc) -> dist/
npm test         # run the Jest test suite
```

## License

MIT
