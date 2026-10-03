import * as X from "xlsx";
import { debugCheck } from "./lib/scoring/debug-check";
const [f, sn, ...labels] = process.argv.slice(2);
const r: any[][] = X.utils.sheet_to_json(X.readFile(f).Sheets[sn], { header: 1, defval: "", raw: true });
const hi = r.findIndex(x => x && x.includes && x.includes("打撃結果") && x.includes("球種"));
const rows = r.slice(hi + 1).filter(x => x && x.length > 40 && x[0] !== "");
for (const x of debugCheck(rows).filter(x => labels.includes(x.label)).slice(0, 8)) {
  const v = (c: number) => rows[x.row]?.[c - 1];
  const n = (c: number) => rows[x.row + 1]?.[c - 1];
  console.log(x.label, "row", x.row + 1, "col", x.col, "=", x.value, "| S/B/O", v(15), v(16), v(17), "->", n(15), n(16), n(17), "| 打席", v(18), "| 作戦", v(30), v(31), v(32), "| 結果", v(46), "| 種類", v(41), "| 次の試合継続", n(20));
}
