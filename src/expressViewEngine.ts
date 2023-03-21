import fs from "fs";
import path from "path";
import ITemplate from "./ITemplate";
import render from "./render";

const expressField = ["_locals", "cache", "settings"];

function expressView(
  filePath: string,
  options: any,
  callback: { (error: object | null, rendered?: string): void }
) {
  fs.readFile(filePath, (err, content) => {
    if (err) return callback(err);

    const template: ITemplate = {
      currentWorkingDirectory: options.settings.views || path.dirname(filePath),
      defaultFileExtension: options.settings["view engine"] || "html",
      template: content.toString(),
    };

    const input = {};
    for (const inputKey in options) {
      if (!expressField.includes(inputKey)) {
        if (Object.prototype.hasOwnProperty.call(options, inputKey)) {
          input[inputKey] = options[inputKey];
        }
      }
    }

    const rendered = render(template, input);
    return callback(null, rendered);
  });
}

export default expressView;
