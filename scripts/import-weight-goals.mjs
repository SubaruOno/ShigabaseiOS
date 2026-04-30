/**
 * ウェイト目標値を「ウェイト蓄積記録.xlsx」から Supabase にインポートするスクリプト
 * 使用方法:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-weight-goals.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://qmbqywqtkstwswslgnvo.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("エラー: SUPABASE_SERVICE_ROLE_KEY 環境変数を設定してください");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const XLSX_PATH = "/Users/subaruono/Downloads/ウェイト蓄積記録.xlsx";

function round2(v) {
  if (v == null) return null;
  return Math.round(v * 100) / 100;
}

async function main() {
  // Excel 読み込み
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // 各選手の目標値を抽出（0以外の最後の値を採用）
  const playerGoals = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = r[1] ? String(r[1]).trim() : null;
    if (!name) continue;
    const bench = r[18] && r[18] !== 0 ? round2(r[18]) : null;
    const dead  = r[19] && r[19] !== 0 ? round2(r[19]) : null;
    const squat = r[20] && r[20] !== 0 ? round2(r[20]) : null;
    if (bench || dead || squat) {
      playerGoals.set(name, { bench, dead, squat });
    }
  }

  console.log(`目標値が見つかった選手数: ${playerGoals.size}`);

  // players テーブルから名前→IDのマップ取得
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, excel_name");
  if (playersError) throw playersError;

  const nameToId = new Map();
  for (const p of players) {
    if (p.excel_name) nameToId.set(p.excel_name, p.id);
    nameToId.set(p.name, p.id);
  }

  const upserts = [];
  const skipped = [];

  for (const [name, goals] of playerGoals) {
    const playerId = nameToId.get(name);
    if (!playerId) {
      skipped.push(name);
      continue;
    }
    upserts.push({
      player_id: playerId,
      bench_goal_kg: goals.bench,
      deadlift_goal_kg: goals.dead,
      squat_goal_kg: goals.squat,
    });
  }

  if (skipped.length > 0) {
    console.warn("\n⚠️  players テーブルに見つからなかった名前（スキップ）:");
    skipped.forEach((n) => console.warn(`  - ${n}`));
  }

  console.log(`\nUpsert 対象: ${upserts.length} 件`);
  upserts.forEach((u) => {
    const p = players.find((pl) => pl.id === u.player_id);
    console.log(`  ${p?.name ?? u.player_id}: B=${u.bench_goal_kg} D=${u.deadlift_goal_kg} S=${u.squat_goal_kg}`);
  });

  const { error } = await supabase
    .from("player_weight_goals")
    .upsert(upserts, { onConflict: "player_id" });

  if (error) {
    console.error("\n❌ エラー:", error.message);
    process.exit(1);
  }

  console.log(`\n✅ 完了: ${upserts.length} 件 upsert`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
