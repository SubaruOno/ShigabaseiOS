import * as X from "xlsx";
import { debugCheck } from "./lib/scoring/debug-check";
for (const f of process.argv.slice(2)) {
  const wb = X.readFile(f);
  for (const sn of wb.SheetNames) {
    const r: any[][] = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: true });
    const hi = r.findIndex(x => x && x[45] === "打撃結果" || (x && x.includes && x.includes("打撃結果") && x.includes("球種")));
    if (hi < 0) continue;
    const rows = r.slice(hi + 1).filter(x => x && x.length > 40 && x[0] !== "");
    const issues = debugCheck(rows);
    const by: Record<string, number> = {};
    issues.forEach(x => by[(x.fatal ? "致命:" : "") + x.label] = (by[(x.fatal ? "致命:" : "") + x.label] || 0) + 1);
    console.log(f.split("/").pop(), sn, "rows", rows.length, "issues", issues.length, JSON.stringify(by));
  }
}
