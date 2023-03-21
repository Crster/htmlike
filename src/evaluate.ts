import IInput from "./IInput";

function evaluate(code: string, input?: IInput): any {
  if (!code) return "";
  const tmp = `return ((${
    input ? Object.keys(input).join(",") : ""
  }) => ${code}).apply(null, Object.values(this))`;

  try {
    return Function(tmp).call(input);
  } catch {
    return null;
  }
}

export default evaluate;
