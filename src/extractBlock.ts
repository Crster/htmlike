import IViewKey from "./IViewKey";

function extractBlock(templateString: string): IViewKey {
  const vBlockRegx = new RegExp('<< header="(.+?)" body="(.*?)">>', "gsi");

  const ret: IViewKey = {};
  do {
    const vResult = vBlockRegx.exec(templateString);
    if (!vResult) break;

    const [vtemplate, vkey, vbody] = vResult;

    if (ret[vkey]) {
      if (vbody) ret[vkey].body.push(vbody);
    } else {
      ret[vkey] = {
        header: vkey,
        body: vbody ? [vbody] : [],
        template: vtemplate,
      };
    }
  } while (true);

  return ret;
}

export default extractBlock;
