import fs from "fs";
import path from "path";
import IInput from "./IInput";
import evaluate from "./evaluate";
import ITemplate from "./ITemplate";
import IBlock from "./IBlock";
import IViewKey from "./IViewKey";
import extractBlock from "./extractBlock";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ITagMatch {
  fullMatch: string;
  header: string;
  body: string;
  index: number;
}

type ControlTagKind = "view" | "block" | "switch" | "for";

interface IFoundControlTag {
  kind: ControlTagKind;
  index: number;
  length: number;
  fullMatch: string;
  header: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Shared regular expressions
//
// `render()` and its helpers (`renderView`/`renderBlock`/`renderSwitch`/
// `renderFor`) recurse once per loop iteration, per `<case>`, and per nested
// view/sub-template, so a template with any non-trivial amount of looping
// can invoke these functions hundreds or thousands of times per request.
// Previously every one of those functions called `new RegExp(...)` on each
// invocation, meaning the *same* static pattern was recompiled from scratch
// every single time. All patterns are hoisted here as module-level
// constants instead, compiled exactly once per process.
//
// Reuse safety: patterns used with `String.prototype.replace` are safe to
// share because `replace` resets `lastIndex` to 0 before scanning. Patterns
// driven manually via `.exec()` with the "g" flag (for depth-aware scanning)
// always have `lastIndex` explicitly assigned immediately before use, so
// interleaved/recursive calls never observe stale state from a previous
// call — each call fully completes its own `exec()` sequence (and, in the
// tag-matching helpers, returns) before any nested/recursive call begins.
// ---------------------------------------------------------------------------

const CONTROL_TAG_NAMES: readonly ControlTagKind[] = [
  "view",
  "block",
  "switch",
  "for",
];

const tagOpenRegexByName: Record<string, RegExp> = {};
const tagTokenRegexByName: Record<string, RegExp> = {};
for (const tagName of CONTROL_TAG_NAMES) {
  tagOpenRegexByName[tagName] = new RegExp(`<${tagName}\\s+{(.*?)}>`, "gsi");
  tagTokenRegexByName[tagName] = new RegExp(
    `<${tagName}\\s+{.*?}>|<\\/${tagName}>`,
    "gsi"
  );
}

const slViewRegx = /<view\s+{([^<>\s]+?)}\s*\/>/gi;
const slBlockRegx = /<block\s+{([^<>\s]+?)}\s*\/>/gi;
const headerArgsRegx = /(.*?)\((.*)\)/i;
const caseOpenRegx = /<case\s+{(.*?)}>/gsi;
const caseTokenRegx = /<switch\s+{.*?}>|<\/switch>|<\/case>/gsi;
const forOfRegx = /(\w+)\s+of\s+(.+)/i;

const codeBlockRegx = /{([^{}\r\n]+?)}/g;
// Explicit opt-out of HTML escaping: {{{expr}}} renders the raw value.
const rawCodeBlockRegx = /{{{([^{}\r\n]+?)}}}/g;
const codeBlockExRegx = /(?<!\{)\{\{?([^{}\r\n]+?)\}?\}(?!\})/g;
const scriptBlockRegx = /<script\s*>(.+)<\/script>/gsi;
const noscriptBlockRegx = /<noscript\s*>(.+)<\/noscript>/gsi;
const styleBlockRegx = /<style\s*>(.+)<\/style>/gsi;
const preBlockRegx = /<pre\s*>(.+)<\/pre>/gsi;

// Internal marker prepended to literal JS/CSS snippets that the whitelist
// (script/style/noscript/pre) reconstruction re-evaluates as quoted string
// literals purely to restore original nested braces. Values carrying this
// marker are verbatim source code, not template output, so they must never
// be HTML-escaped.
const RAW_SENTINEL = "\u0000__HTMLIKE_RAW__\u0000";

// ---------------------------------------------------------------------------
// Depth-aware tag matching
// ---------------------------------------------------------------------------

// Finds the first `<tagName {header}>...</tagName>` span in `template`
// starting at or after `fromIndex`, tracking nested occurrences of the same
// tag so the *matching* close tag is returned instead of simply the nearest
// or furthest one. This allows the same tag to be nested inside itself
// (e.g. `<block>` inside `<block>`) and allows multiple sibling tags of the
// same name to be processed independently instead of being merged together
// by a single greedy/non-greedy regex span.
function extractTag(
  template: string,
  tagName: string,
  fromIndex = 0
): ITagMatch | null {
  // Driving the search via `lastIndex` on a reused global regex avoids
  // `template.slice(fromIndex)`, which would otherwise allocate a fresh
  // copy of the (potentially large) remaining template on every call —
  // this function runs up to 4x per control tag resolved, so that slicing
  // cost would otherwise compound to O(n * number-of-tags).
  const openRegx = tagOpenRegexByName[tagName];
  openRegx.lastIndex = fromIndex;
  const openMatch = openRegx.exec(template);
  if (!openMatch) return null;

  const startIndex = openMatch.index;
  const header = openMatch[1];
  const bodyStart = startIndex + openMatch[0].length;

  const tokenRegx = tagTokenRegexByName[tagName];
  tokenRegx.lastIndex = bodyStart;

  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenRegx.exec(template))) {
    if (token[0].toLowerCase() === `</${tagName}>`) {
      depth--;
      if (depth === 0) {
        const body = template.slice(bodyStart, token.index);
        const fullMatch = template.slice(
          startIndex,
          token.index + token[0].length
        );
        return { fullMatch, header, body, index: startIndex };
      }
    } else {
      depth++;
    }
  }

  return null;
}

// A `<block>` nested inside another `<block>`'s body renders as a
// placeholder embedded inside its parent's placeholder (base64-encoded, see
// `renderBlock`). A single, non-recursive `extractBlock` pass only sees the
// outer placeholder, so the inner one would otherwise never be resolved and
// would leak its raw internal placeholder syntax verbatim into the final
// HTML. This recursively discovers block placeholders at any nesting depth,
// strips each one out of its parent's body text once decoded, and flattens
// every header into a single map keyed by block name.
function extractBlockDeep(text: string): IViewKey {
  const blocks = extractBlock(text);

  for (const key of Object.keys(blocks)) {
    const flattenedBody: string[] = [];

    for (const bodyText of blocks[key].body) {
      const nestedBlocks = extractBlockDeep(bodyText);

      let strippedBody = bodyText;
      for (const nested of Object.values(nestedBlocks)) {
        strippedBody = strippedBody.replace(nested.template, "");
      }
      flattenedBody.push(strippedBody);

      for (const [nestedKey, nested] of Object.entries(nestedBlocks)) {
        if (blocks[nestedKey]) {
          blocks[nestedKey].body.push(...nested.body);
        } else {
          blocks[nestedKey] = nested;
        }
      }
    }

    blocks[key].body = flattenedBody;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Unified, position-ordered control-tag dispatcher
// ---------------------------------------------------------------------------

// Resolves `header(args)` syntax (used by `<view>`/`<block>`) into a plain
// header name plus an evaluated args object, or just the header if no args
// were supplied.
function parseHeaderArgs(
  header: string,
  input?: IInput
): { header: string; args?: object } {
  const withArgs = headerArgsRegx.exec(header);

  if (withArgs) {
    return { header: withArgs[1], args: evaluate(`(${withArgs[2]})`, input) };
  }

  return { header };
}

// `<view>`, `<block>`, `<switch>` and `<for>` are different tag types that
// can be arbitrarily nested inside one another (e.g. a `<switch>` inside a
// `<for>` loop, which needs the loop's per-iteration variable in scope).
// Resolving each tag TYPE in a fixed global pass over the whole template
// (as the previous implementation did) processes whichever tag type comes
// first in that fixed order, even when it is textually nested inside an
// unresolved tag of a different type still waiting its turn — evaluating
// it with the wrong (outer) scope. Scanning for whichever tag actually
// starts first in the text, regardless of its type, and resolving it
// immediately (recursing into its body independently) mirrors real nested
// parsing and keeps each tag's scope correct regardless of tag-type mix.
function findNextControlTag(
  text: string,
  fromIndex: number
): IFoundControlTag | null {
  const candidates: IFoundControlTag[] = [];

  slViewRegx.lastIndex = fromIndex;
  const slViewMatch = slViewRegx.exec(text);
  if (slViewMatch) {
    candidates.push({
      kind: "view",
      index: slViewMatch.index,
      length: slViewMatch[0].length,
      fullMatch: slViewMatch[0],
      header: slViewMatch[1],
      body: "",
    });
  }

  slBlockRegx.lastIndex = fromIndex;
  const slBlockMatch = slBlockRegx.exec(text);
  if (slBlockMatch) {
    candidates.push({
      kind: "block",
      index: slBlockMatch.index,
      length: slBlockMatch[0].length,
      fullMatch: slBlockMatch[0],
      header: slBlockMatch[1],
      body: "",
    });
  }

  for (const kind of CONTROL_TAG_NAMES) {
    const found = extractTag(text, kind, fromIndex);
    if (found) {
      candidates.push({
        kind,
        index: found.index,
        length: found.fullMatch.length,
        fullMatch: found.fullMatch,
        header: found.header,
        body: found.body,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Only the leftmost candidate is needed; avoid a full sort for what is
  // typically a handful of entries.
  let earliest = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].index < earliest.index) earliest = candidates[i];
  }

  return earliest;
}

function dispatchControlTag(
  found: IFoundControlTag,
  chtml: ITemplate,
  input?: IInput
): string {
  if (found.kind === "view" || found.kind === "block") {
    const { header, args } = parseHeaderArgs(found.header, input);
    const block: IBlock = {
      ...chtml,
      template: found.fullMatch,
      header,
      args,
      body: found.body,
    };

    return found.kind === "view"
      ? renderView(block, input)
      : renderBlock(block, input);
  }

  if (found.kind === "switch") {
    return renderSwitch(
      {
        ...chtml,
        template: found.fullMatch,
        header: found.header,
        body: found.body,
      },
      input
    );
  }

  return renderFor(
    {
      ...chtml,
      template: found.fullMatch,
      header: found.header,
      body: found.body,
    },
    input
  );
}

// Repeatedly finds and resolves whichever control tag (of any kind) starts
// earliest in `text`, building the output segment-by-segment. This mirrors
// recursive-descent parsing: every nested tag inherits the correctly
// scoped `input` from its immediate parent's own `render()` recursion,
// regardless of how the tag kinds are mixed/nested.
function processControlTags(
  text: string,
  chtml: ITemplate,
  input?: IInput
): string {
  let result = "";
  let cursor = 0;

  while (true) {
    const found = findNextControlTag(text, cursor);
    if (!found) break;

    result += text.slice(cursor, found.index);
    result += dispatchControlTag(found, chtml, input);
    cursor = found.index + found.length;
  }

  result += text.slice(cursor);
  return result;
}

// ---------------------------------------------------------------------------
// Tag renderers
// ---------------------------------------------------------------------------

function renderView(block: IBlock, input?: IInput): string {
  let viewPath = path.join(block.currentWorkingDirectory, block.header);
  if (path.extname(block.header) === "") {
    viewPath = `${viewPath}.${block.defaultFileExtension}`;
  }

  try {
    fs.accessSync(viewPath, fs.constants.R_OK);

    const viewTemplate: ITemplate = {
      currentWorkingDirectory: block.currentWorkingDirectory,
      defaultFileExtension: block.defaultFileExtension,
      template: fs.readFileSync(viewPath).toString(),
    };
    let renderedView = render(
      viewTemplate,
      block.args ? { ...input, ...block.args } : input
    );

    const template: ITemplate = {
      currentWorkingDirectory: block.currentWorkingDirectory,
      defaultFileExtension: block.defaultFileExtension,
      template: block.body,
    };
    let renderedViewBody = render(template, input);

    const viewBlocks = extractBlockDeep(renderedView);
    const viewBodyBlocks = extractBlockDeep(renderedViewBody);

    for (const vbb of Object.values(viewBodyBlocks)) {
      renderedViewBody = renderedViewBody.replace(vbb.template, "");
    }

    if (viewBlocks["body"]) {
      viewBlocks["body"].body.push(renderedViewBody);
    }

    for (const vb of Object.values(viewBlocks)) {
      if (viewBodyBlocks[vb.header]) {
        viewBlocks[vb.header].body.push(...viewBodyBlocks[vb.header].body);
      }
    }

    for (const vb of Object.values(viewBlocks)) {
      if (vb.body.length > 0) {
        renderedView = renderedView.replace(vb.template, vb.body.join("\n"));
      } else {
        renderedView = renderedView.replace(vb.template, "");
      }
    }

    return renderedView;
  } catch {
    return "";
  }
}

function renderBlock(block: IBlock, input?: IInput): string {
  let body = "";
  if (block.body) {
    const template: ITemplate = {
      currentWorkingDirectory: block.currentWorkingDirectory,
      defaultFileExtension: block.defaultFileExtension,
      template: block.body,
    };

    body = render(template, block.args ? { ...input, ...block.args } : input);
  }

  // The rendered body may itself contain another block's placeholder (e.g.
  // a named `<block>` nested inside another `<block>`), which would embed
  // stray `"` / `">>` sequences into this placeholder's own `body="..."`
  // attribute and break the (necessarily non-greedy) parsing done by
  // `extractBlock`. Base64-encoding the body guarantees it cannot contain
  // characters that collide with the placeholder syntax, regardless of
  // nesting depth.
  const encodedBody = Buffer.from(body, "utf8").toString("base64");
  return `<< header="${block.header}" body="${encodedBody}">>`;
}

// Depth-aware extraction of `<case>...</case>` spans directly inside a
// `<switch>` body. A `<case>` body may itself contain a whole nested
// `<switch>...<case>...</case>...</switch>`; the nested switch's own case
// tags must not be mistaken for the outer case's boundary, so `<switch>`
// nesting is tracked while scanning for the matching `</case>`.
function replaceCase(
  body: string,
  callback: (fullMatch: string, header: string, caseBody: string) => string
): string {
  let result = "";
  let cursor = 0;

  while (true) {
    caseOpenRegx.lastIndex = cursor;
    const openMatch = caseOpenRegx.exec(body);
    if (!openMatch) break;

    const startIndex = openMatch.index;
    const header = openMatch[1];
    const bodyStart = startIndex + openMatch[0].length;

    caseTokenRegx.lastIndex = bodyStart;
    let switchDepth = 0;
    let endIndex = -1;
    let token: RegExpExecArray | null;
    while ((token = caseTokenRegx.exec(body))) {
      const tok = token[0].toLowerCase();
      if (tok === "</switch>") {
        switchDepth--;
      } else if (tok === "</case>") {
        if (switchDepth === 0) {
          endIndex = token.index + token[0].length;
          break;
        }
      } else {
        switchDepth++;
      }
    }

    if (endIndex === -1) break;

    const caseBody = body.slice(bodyStart, endIndex - "</case>".length);
    result += body.slice(cursor, startIndex);
    result += callback(body.slice(startIndex, endIndex), header, caseBody);
    cursor = endIndex;
  }

  result += body.slice(cursor);
  return result;
}

function renderSwitch(block: IBlock, input?: IInput): string {
  const switchValue = evaluate(block.header, input);

  return replaceCase(
    block.body,
    (match: string, caseHeader: string, caseBody: string): string => {
      const template: ITemplate = {
        currentWorkingDirectory: block.currentWorkingDirectory,
        defaultFileExtension: block.defaultFileExtension,
        template: caseBody,
      };

      if (!caseHeader) return render(template, input);
      const caseValue = evaluate(caseHeader, input);

      if (switchValue === caseValue) {
        return render(template, input);
      }

      return "";
    }
  );
}

function renderFor(block: IBlock, input?: IInput): string {
  const [, key, value] = forOfRegx.exec(block.header);
  const values = evaluate(value, input);

  if (!values || !Array.isArray(values) || values.length === 0) return "";

  const template: ITemplate = {
    currentWorkingDirectory: block.currentWorkingDirectory,
    defaultFileExtension: block.defaultFileExtension,
    template: block.body,
  };

  const ret = new Array(values.length);
  for (let xx = 0; xx < values.length; xx++) {
    ret[xx] = render(template, { [key]: values[xx] });
  }

  return ret.join("");
}

// ---------------------------------------------------------------------------
// Code-expression rendering ({expr}, {{{expr}}}, and whitelisted tag bodies)
// ---------------------------------------------------------------------------

function escapeHtml(value: any): string {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCode(block: IBlock, input?: IInput, escape = true): string {
  const value = evaluate(block.body, input);

  const format = (item: any): string => {
    if (typeof item === "string" && item.startsWith(RAW_SENTINEL)) {
      return item.slice(RAW_SENTINEL.length);
    }
    return escape ? escapeHtml(item) : item ?? "";
  };

  if (Array.isArray(value)) {
    return value.map(format).join("");
  } else {
    return format(value);
  }
}

function renderWhitelist(chtml: ITemplate, input: IInput | undefined) {
  return (match: string, body: string): string => {
    return match.replace(
      codeBlockExRegx,
      (match2: string, body2: string): string => {
        if (match2.startsWith("{{") && match2.endsWith("}}")) {
          return renderCode(
            { ...chtml, template: match2, header: "", body: body2 },
            input,
            false
          );
        } else if (body2.includes('"')) {
          return "{{" + "'" + RAW_SENTINEL + body2 + "'" + "}}";
        } else {
          return "{{" + '"' + RAW_SENTINEL + body2 + '"' + "}}";
        }
      }
    );
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function render(template: ITemplate | string, input?: IInput): string {
  try {
    const chtml: ITemplate = {
      currentWorkingDirectory: path.resolve("./"),
      defaultFileExtension: "html",
      template: "",
    };

    if (typeof template === "string") {
      chtml.template = template;
    } else {
      chtml.currentWorkingDirectory = path.resolve(
        template.currentWorkingDirectory
      );
      chtml.defaultFileExtension =
        template.defaultFileExtension ?? chtml.defaultFileExtension;
      chtml.template = template.template;
    }

    const output = processControlTags(chtml.template, chtml, input);
    const whitelistReplacer = renderWhitelist(chtml, input);

    return output
      .replace(scriptBlockRegx, whitelistReplacer)
      .replace(noscriptBlockRegx, whitelistReplacer)
      .replace(styleBlockRegx, whitelistReplacer)
      .replace(preBlockRegx, whitelistReplacer)
      .replace(rawCodeBlockRegx, (match: string, body: string): string => {
        return renderCode(
          { ...chtml, template: match, header: "", body },
          input,
          false
        );
      })
      .replace(codeBlockRegx, (match: string, body: string): string => {
        return renderCode(
          { ...chtml, template: match, header: "", body },
          input
        );
      });
  } catch (err) {
    return `<pre>${err.message}</pre>`;
  }
}

export default render;
