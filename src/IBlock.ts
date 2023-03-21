import ITemplate from "./ITemplate";

export default interface IBlock extends ITemplate {
  header: string;
  body: string;
  args?: object;
}
