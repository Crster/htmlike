import fs from "fs";
import path from "path";
import IInput from "./IInput";
import evaluate from "./evaluate";
import ITemplate from "./ITemplate";
import IBlock from "./IBlock";
import extractBlock from "./extractBlock";

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

    const viewBlocks = extractBlock(renderedView);
    const viewBodyBlocks = extractBlock(renderedViewBody);

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

  return `<< header="${block.header}" body="${body}">>`;
}

function renderSwitch(block: IBlock, input?: IInput): string {
  const caseBlockRegx = new RegExp("<case\\s+{(.*?)}>(.+?)<\\/case>", "gsi");
  const switchValue = evaluate(block.header, input);

  return block.body.replace(
    caseBlockRegx,
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
  const forBlockRegx = new RegExp("(\\w+)\\s+of\\s+(.+)", "gi");

  const [match, key, value] = forBlockRegx.exec(block.header);
  const values = evaluate(value, input);

  const ret = [];
  if (values && Array.isArray(values) && values.length > 0) {
    for (let xx = 0; xx < values.length; xx++) {
      const template: ITemplate = {
        currentWorkingDirectory: block.currentWorkingDirectory,
        defaultFileExtension: block.defaultFileExtension,
        template: block.body,
      };

      ret.push(render(template, { [key]: values[xx] }));
    }
  }

  return ret.join("");
}

function renderCode(block: IBlock, input?: IInput): string {
  const value = evaluate(block.body, input);

  if (Array.isArray(value)) {
    return value.join("");
  } else {
    return value ?? "";
  }
}

function render(template: ITemplate | string, input?: IInput): string {
  const slViewRegx = new RegExp("<view\\s+{([^<>\\s]+?)}\\s*\\/>", "gi");
  const mlViewRegx = new RegExp("<view\\s+{(.+?)}>(.+?)<\\/view>", "gsi");
  const slBlockRegx = new RegExp("<block\\s+{([^<>\\s]+?)}\\s*\\/>", "gi");
  const mlBlockRegx = new RegExp("<block\\s+{(.+?)}>(.+?)<\\/block>", "gsi");
  const forRegx = new RegExp("<for\\s+{(.+?)}>(.+)<\\/for>", "gsi");
  const switchBlockRegx = new RegExp(
    "<switch\\s+{(.+?)}>(.+)<\\/switch>",
    "gsi"
  );
  const codeBlockRegx = new RegExp("{([^{}\\r\\n]+?)}", "g");
  const codeBlockExRegx = new RegExp(
    "(?<!\\{)\\{\\{?([^{}\\r\\n]+?)\\}?\\}(?!\\})",
    "g"
  );
  const scriptBlockRegx = new RegExp("<script\\s*>(.+)<\\/script>", "gsi");
  const noscriptBlockRegx = new RegExp(
    "<noscript\\s*>(.+)<\\/noscript>",
    "gsi"
  );
  const styleBlockRegx = new RegExp("<style\\s*>(.+)<\\/style>", "gsi");
  const preBlockRegx = new RegExp("<pre\\s*>(.+)<\\/pre>", "gsi");

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

    const renderWhitelist = (match: string, body: string): string => {
      return match.replace(
        codeBlockExRegx,
        (match2: string, body2: string): string => {
          if (match2.startsWith("{{") && match2.endsWith("}}")) {
            return renderCode(
              { ...chtml, template: match2, header: "", body: body2 },
              input
            );
          } else if (body2.includes('"')) {
            return "{{" + "'" + body2 + "'" + "}}";
          } else {
            return "{{" + '"' + body2 + '"' + "}}";
          }
        }
      );
    };

    return chtml.template
      .replace(slViewRegx, (match: string, header: string): string => {
        const withArgs = /(.*?)\((.*)\)/gi.exec(header);

        if (withArgs) {
          return renderView(
            {
              ...chtml,
              template: match,
              header: withArgs[1],
              args: evaluate(`(${withArgs[2]})`, input),
              body: "",
            },
            input
          );
        } else {
          return renderView(
            { ...chtml, template: match, header, body: "" },
            input
          );
        }
      })
      .replace(
        mlViewRegx,
        (match: string, header: string, body: string): string => {
          const withArgs = /(.*?)\((.*)\)/gi.exec(header);

          if (withArgs) {
            return renderView(
              {
                ...chtml,
                template: match,
                header: withArgs[1],
                args: evaluate(`(${withArgs[2]})`, input),
                body,
              },
              input
            );
          } else {
            return renderView(
              { ...chtml, template: match, header, body },
              input
            );
          }
        }
      )
      .replace(slBlockRegx, (match: string, header: string): string => {
        const withArgs = /(.*?)\((.*)\)/gi.exec(header);

        if (withArgs) {
          return renderBlock(
            {
              ...chtml,
              template: match,
              header: withArgs[1],
              args: evaluate(`(${withArgs[2]})`, input),
              body: "",
            },
            input
          );
        } else {
          return renderBlock(
            { ...chtml, template: match, header, body: "" },
            input
          );
        }
      })
      .replace(
        mlBlockRegx,
        (match: string, header: string, body: string): string => {
          const withArgs = /(.*?)\((.*)\)/gi.exec(header);

          if (withArgs) {
            return renderBlock(
              {
                ...chtml,
                template: match,
                header: withArgs[1],
                args: evaluate(`(${withArgs[2]})`, input),
                body,
              },
              input
            );
          } else {
            return renderBlock(
              { ...chtml, template: match, header, body },
              input
            );
          }
        }
      )
      .replace(
        switchBlockRegx,
        (match: string, header: string, body: string): string => {
          return renderSwitch(
            { ...chtml, template: match, header, body },
            input
          );
        }
      )
      .replace(
        forRegx,
        (match: string, header: string, body: string): string => {
          return renderFor({ ...chtml, template: match, header, body }, input);
        }
      )
      .replace(scriptBlockRegx, renderWhitelist)
      .replace(noscriptBlockRegx, renderWhitelist)
      .replace(styleBlockRegx, renderWhitelist)
      .replace(preBlockRegx, renderWhitelist)
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
