/**
 * 既存ゲームのイニング別得点を一括更新するスクリプト
 * 使用方法: node scripts/backfill-linescore.mjs <ExcelファイルのパスまたはExcelが入ったディレクトリ>
 */
import XLSX from "../node_modules/xlsx/xlsx.mjs";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const SUPABASE_URL = "https://qmbqywqtkstwswslgnvo.supabase.co";

// compact[7]=play_number, compact[8]=inning, compact[10]=先攻累積, compact[11]=後攻累積
const COMPACT_COLS = [
  0, 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  21, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 54, 56, 181, 182,
];

const EXCLUDED_SHEETS = new Set([
  "出場選手", "Sheet1", "データ概要", "作戦分析_攻撃", "投手個人成績",
]);

function computeLinescoreFromRows(rows) {
  const games = [];
  let current = [];
  for (const row of rows) {
    if (row[7] === 1 && current.length > 0) {
      games.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) games.push(current);

  return games.map((gameRows) => {
    const firstRow = gameRows[0];
    const awayInningRuns = {};
    const homeInningRuns = {};

    for (let i = 0; i < gameRows.length - 1; i++) {
      const curr = gameRows[i];
      const next = gameRows[i + 1];
      const inning = curr[8];
      const awayDelta = (next[10] ?? 0) - (curr[10] ?? 0);
      const homeDelta = (next[11] ?? 0) - (curr[11] ?? 0);
      if (awayDelta > 0 && inning != null) {
        awayInningRuns[inning] = (awayInningRuns[inning] ?? 0) + awayDelta;
      }
      if (homeDelta > 0 && inning != null) {
        homeInningRuns[inning] = (homeInningRuns[inning] ?? 0) + homeDelta;
      }
    }

    const keys = [...Object.keys(awayInningRuns), ...Object.keys(homeInningRuns)].map(Number);
    const maxInning = keys.length > 0 ? Math.max(...keys, 9) : 9;
    const away_runs = Array.from({ length: maxInning }, (_, i) => awayInningRuns[i + 1] ?? 0);
    const home_runs = Array.from({ length: maxInning }, (_, i) => homeInningRuns[i + 1] ?? 0);

    const dateVal = firstRow[0];
    const game_date = dateVal instanceof Date
      ? dateVal.toISOString()
      : String(dateVal);
    const game_number = firstRow[4];

    return { game_date, game_number, away_runs, home_runs };
  });
}

function processFile(filePath) {
  console.log(`Processing: ${filePath}`);
  const bytes = new Uint8Array(readFileSync(filePath));
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });

  let allRows = [];
  for (const name of wb.SheetNames) {
    if (EXCLUDED_SHEETS.has(name)) continue;
    const ws = wb.Sheets[name];
    if (!ws?.["!ref"]) continue;
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (rawRows.length < 3) continue;
    const dataRows = rawRows
      .slice(2)
      .filter((r) => r[9])
      .map((r) => COMPACT_COLS.map((i) => r[i] ?? null));
    if (dataRows.length > allRows.length) {
      allRows = dataRows;
    }
  }

  if (allRows.length === 0) return [];
  return computeLinescoreFromRows(allRows);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("使い方: node scripts/backfill-linescore.mjs <Excelファイル または ディレクトリ>");
    process.exit(1);
  }

  // Get auth token from env or prompt
  const token = process.env.SUPABASE_TOKEN;
  if (!token) {
    console.error("SUPABASE_TOKEN 環境変数を設定してください");
    console.error("例: SUPABASE_TOKEN=<アクセストークン> node scripts/backfill-linescore.mjs ...");
    process.exit(1);
  }

  let files = [];
  for (const arg of args) {
    const stat = statSync(arg);
    if (stat.isDirectory()) {
      const entries = readdirSync(arg);
      files.push(...entries.filter(e => [".xlsx", ".xls"].includes(extname(e))).map(e => join(arg, e)));
    } else {
      files.push(arg);
    }
  }

  console.log(`${files.length} ファイルを処理します`);

  let allUpdates = [];
  for (const f of files) {
    try {
      const updates = processFile(f);
      allUpdates.push(...updates);
    } catch (e) {
      console.error(`Error processing ${f}:`, e.message);
    }
  }

  console.log(`合計 ${allUpdates.length} 試合分のイニングスコアを更新します`);

  // Batch in groups of 10
  for (let i = 0; i < allUpdates.length; i += 10) {
    const batch = allUpdates.slice(i, i + 10);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/update-linescore`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updates: batch }),
    });
    const result = await res.json();
    console.log(`バッチ ${Math.floor(i / 10) + 1}: ${result.updated ?? 0} 試合更新`);
  }

  console.log("完了");
}

main().catch(console.error);
