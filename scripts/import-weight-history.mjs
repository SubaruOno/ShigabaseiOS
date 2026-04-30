/**
 * 過去ウエイトトレーニングデータをCSVからSupabaseにインポートするスクリプト
 * 使用方法:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-weight-history.mjs
 *
 * 事前に Supabase Dashboard > Settings > API > service_role key を取得してください
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SUPABASE_URL = "https://qmbqywqtkstwswslgnvo.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("エラー: SUPABASE_SERVICE_ROLE_KEY 環境変数を設定してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// CSV ファイルパス（2つのCSVをマージして使用）
const CSV_FILES = [
  "/Users/subaruono/Downloads/ウエイトトレーニング - 生データ.csv",
  "/Users/subaruono/Downloads/ウエイトトレーニング 2025年 - 生データ.csv",
];

function parseNum(val) {
  if (!val || val === "" || val === "0") return null;
  // "75kg" のような値に対応
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return isNaN(n) || n === 0 ? null : n;
}

function parseDate(val) {
  if (!val) return null;
  // "2025/07/01" → "2025-07-01"
  return String(val).replace(/\//g, "-");
}

async function loadPlayers() {
  const { data, error } = await supabase.from("players").select("id, name, excel_name");
  if (error) throw error;
  // 名前 → id のマップ（excel_name 優先）
  const map = new Map();
  for (const p of data) {
    if (p.excel_name) map.set(p.excel_name, p.id);
    map.set(p.name, p.id);
  }
  return map;
}

function parseRow(row) {
  // 列インデックス（ヘッダー行を除いた生データ想定）
  // 列0:日付, 1:名前, 2:ベンチ重量, 3:ベンチ回数, 4:デッドリフト重量,
  // 5:デッドリフト回数, 6:スクワット重量, 7:スクワット回数,
  // 8:1RMベンチ(スキップ), 9:1RMデッド(スキップ), 10:1RMスクワット(スキップ)
  // 11:その他, 12:体重, 13:体脂肪率, 14-16:チーム平均(スキップ), 17:除脂肪体重
  const values = Object.values(row);
  return {
    date: parseDate(values[0]),
    name: String(values[1] ?? "").trim(),
    bench_weight: parseNum(values[2]),
    bench_reps: parseNum(values[3]),
    deadlift_weight: parseNum(values[4]),
    deadlift_reps: parseNum(values[5]),
    squat_weight: parseNum(values[6]),
    squat_reps: parseNum(values[7]),
    other_exercises: String(values[11] ?? "").trim() || null,
    body_weight_kg: parseNum(values[12]),
    body_fat_pct: parseNum(values[13]),
    lean_mass_kg: parseNum(values[17]),
  };
}

async function main() {
  console.log("選手データを取得中...");
  const playerMap = await loadPlayers();
  console.log(`選手数: ${playerMap.size}`);

  // 2つのCSVを読み込み、重複除去（日付+選手名でユニーク）
  const seen = new Set();
  const allRows = [];

  for (const csvPath of CSV_FILES) {
    let content;
    try {
      content = readFileSync(csvPath, "utf-8");
    } catch {
      console.warn(`スキップ: ${csvPath} が見つかりません`);
      continue;
    }

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });

    for (const record of records) {
      const row = parseRow(record);
      if (!row.date || !row.name) continue;

      const key = `${row.date}__${row.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
    }
  }

  console.log(`合計レコード数（重複除去後）: ${allRows.length}`);

  // 選手名→IDに変換してinsert
  const sessions = [];
  const skipped = [];

  for (const row of allRows) {
    const playerId = playerMap.get(row.name);
    if (!playerId) {
      skipped.push(row.name);
      continue;
    }
    sessions.push({
      player_id: playerId,
      recorded_at: row.date,
      bench_weight: row.bench_weight,
      bench_reps: row.bench_reps ? Math.round(row.bench_reps) : null,
      deadlift_weight: row.deadlift_weight,
      deadlift_reps: row.deadlift_reps ? Math.round(row.deadlift_reps) : null,
      squat_weight: row.squat_weight,
      squat_reps: row.squat_reps ? Math.round(row.squat_reps) : null,
      other_exercises: row.other_exercises,
      body_weight_kg: row.body_weight_kg,
      body_fat_pct: row.body_fat_pct,
      lean_mass_kg: row.lean_mass_kg,
    });
  }

  if (skipped.length > 0) {
    const unique = [...new Set(skipped)];
    console.warn(`\n⚠️  players テーブルに見つからなかった名前（スキップ）:`);
    unique.forEach((n) => console.warn(`  - ${n}`));
  }

  // 同一選手・同月の重複を除去（最後の記録を採用）
  const monthMap = new Map();
  for (const s of sessions) {
    const monthKey = `${s.player_id}__${s.recorded_at.slice(0, 7)}`; // "YYYY-MM"
    const existing = monthMap.get(monthKey);
    if (!existing || s.recorded_at > existing.recorded_at) {
      monthMap.set(monthKey, s);
    }
  }
  const deduped = [...monthMap.values()];
  console.log(`月次重複除去後: ${deduped.length} 件（${sessions.length - deduped.length} 件スキップ）`);

  // 100件ずつバッチinsert
  let inserted = 0;
  const BATCH = 100;
  const sessionsToInsert = deduped;

  for (let i = 0; i < sessionsToInsert.length; i += BATCH) {
    const batch = sessionsToInsert.slice(i, i + BATCH);
    const { error } = await supabase
      .from("weight_sessions")
      .insert(batch);

    if (error) {
      console.error(`バッチ ${i}-${i + BATCH} エラー:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r進捗: ${inserted}/${sessionsToInsert.length}`);
    }
  }

  console.log(`\n\n✅ 完了: ${inserted} 件 insert`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
