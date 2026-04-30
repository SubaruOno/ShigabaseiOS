/**
 * /tmp/linescore_updates.json の内容を Management API 経由で DB に直接書き込む
 * 使用方法: node scripts/run-backfill-sql.mjs
 */
import { readFileSync } from "fs";
import { execSync } from "child_process";

const PROJECT_REF = "qmbqywqtkstwswslgnvo";
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const JSON_PATH = "/tmp/linescore_updates.json";

const rawToken = execSync("security find-generic-password -s 'Supabase CLI' -w 2>/dev/null").toString().trim();
// Token is stored as go-keyring-base64:<base64>
const token = rawToken.startsWith("go-keyring-base64:")
  ? Buffer.from(rawToken.replace("go-keyring-base64:", ""), "base64").toString("utf8")
  : rawToken;
if (!token) {
  console.error("Supabase アクセストークンが取得できませんでした");
  process.exit(1);
}

const updates = JSON.parse(readFileSync(JSON_PATH, "utf8"));
console.log(`${updates.length} 件を更新します`);

let ok = 0;
let fail = 0;

for (const u of updates) {
  const awayArr = `'{${u.away_runs.join(",")}}'::integer[]`;
  const homeArr = `'{${u.home_runs.join(",")}}'::integer[]`;
  const dateFilter = `date = '${u.game_date}'::timestamptz`;
  const numFilter = u.game_number == null
    ? "game_number IS NULL"
    : `game_number = ${u.game_number}`;
  const sql = `UPDATE games SET away_runs_per_inning=${awayArr}, home_runs_per_inning=${homeArr} WHERE ${dateFilter} AND ${numFilter}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const data = await res.json();
  if (res.ok) {
    ok++;
  } else {
    fail++;
    console.error(`FAIL: ${u.game_date} game_number=${u.game_number}`, data);
  }
}

console.log(`完了: ${ok} 件成功, ${fail} 件失敗`);
