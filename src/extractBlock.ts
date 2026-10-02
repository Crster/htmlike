import IViewKey from "./IViewKey";

// Hoisted to module scope: `extractBlock` is called recursively (once per
// nesting level, see `extractBlockDeep` in render.ts) and potentially many
// times per render, so recompiling this pattern on every call would add up.
// It's safe to reuse: being "g"-flagged, `String.prototype` callers aside,
// we drive it manually via `lastIndex`, which is explicitly reset to 0
// before each scan below.
const vBlockRegx = /<< header="(.+?)" body="(.*?)">>/gsi;

function extractBlock(templateString: string): IViewKey {
  vBlockRegx.lastIndex = 0;

  const ret: IViewKey = {};
  do {
    const vResult = vBlockRegx.exec(templateString);
    if (!vResult) break;

    const [vtemplate, vkey, vbodyEncoded] = vResult;
    // Body is base64-encoded by renderBlock so that nested block
    // placeholders embedded within it cannot be mistaken for the end of
    // this placeholder's own `body="..."` attribute.
    const vbody = vbodyEncoded
      ? Buffer.from(vbodyEncoded, "base64").toString("utf8")
      : vbodyEncoded;

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
