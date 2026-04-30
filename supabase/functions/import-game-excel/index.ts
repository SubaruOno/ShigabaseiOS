import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// Excel パースはクライアント側で実行済み。
// この Edge Function は DB 挿入のみを担当する（CPU 制限を回避）。

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};
const toInt = (v: any): number | null => {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
};
const toStr = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const toDate = (v: any): string | null => {
  if (!v) return null;
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// クライアント側 COMPACT_COLS に対応するコンパクト列マッピング
// C[i] = 元の Excel 列番号
//   C[0]=col0(date),     C[1]=col1(season),     C[2]=col2(kind),
//   C[3]=col3(week),     C[4]=col5(game_num),   C[5]=col7(home_team),
//   C[6]=col8(away_team),C[7]=col9(play_num),   C[8]=col10(inning),
//   C[9]=col11(top_btm), C[10]=col12(away_sc),  C[11]=col13(home_sc),
//   C[12]=col14(strikes),C[13]=col15(balls),    C[14]=col16(outs),
//   C[15]=col17(pa_cmp), C[16]=col21(run1st),   C[17]=col23(run2nd),
//   C[18]=col25(run3rd), C[19]=col26(bat_ord),  C[20]=col27(bat_nm),
//   C[21]=col28(bat_hd), C[22]=col29(strat),    C[23]=col30(strat2),
//   C[24]=col31(st_res), C[25]=col32(pit_nm),   C[26]=col33(pit_hd),
//   C[27]=col34(pit_cnt),C[28]=col35(cat_nm),   C[29]=col42(course_x),
//   C[30]=col43(course_y),C[31]=col44(pit_typ), C[32]=col45(bat_res),
//   C[33]=col46(bat_r2), C[34]=col47(fielder),  C[35]=col48(hit_typ),
//   C[36]=col49(hit_str),C[37]=col50(hit_x),    C[38]=col51(hit_y),
//   C[39]=col54(err_typ),C[40]=col56(pit_spd),  C[41]=col181(scorekeeper),
//   C[42]=col182(offense_team)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "認証エラー" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseUser.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "認証エラー" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // クライアント側でパース済みのコンパクト行配列を受信
    const body = await req.json();
    const { file_name, rows: allDataRows } = body as {
      file_name: string;
      rows: any[][];
    };

    if (!allDataRows || allDataRows.length === 0) {
      return new Response(JSON.stringify({ error: "投球データが見つかりません" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 試合ごとにグループ分け（日付 + 先攻 + 後攻 + game_number で識別）
    // game_number を含めることでダブルヘッダーを別試合として扱う
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    type GameGroup = { rows: any[][]; firstRow: any[]; lastRow: any[] };
    const gameMap = new Map<string, GameGroup>();

    for (const row of allDataRows) {
      const dateStr = toDate(row[0])?.split("T")[0] ?? "unknown"; // C[0] date
      const away = toStr(row[6]) ?? "";   // C[6] away_team
      const home = toStr(row[5]) ?? "";   // C[5] home_team
      const gameNum = toNum(row[4]) ?? ""; // C[4] game_number（ダブルヘッダー区別用）
      const key = `${dateStr}|${away}|${home}|${gameNum}`;
      if (!gameMap.has(key)) {
        gameMap.set(key, { rows: [], firstRow: row, lastRow: row });
      }
      const g = gameMap.get(key)!;
      g.rows.push(row);
      g.lastRow = row;
    }

    let insertedGames = 0;
    let skippedGames = 0;
    let totalPitches = 0;

    for (const [, group] of gameMap) {
      const { rows: gameRows, firstRow, lastRow } = group;

      const gameDate  = toDate(firstRow[0]);          // C[0]
      const dateStr   = gameDate?.split("T")[0] ?? ""; // "YYYY-MM-DD"
      const awayTeam  = toStr(firstRow[6]) ?? "";     // C[6]
      const homeTeam  = toStr(firstRow[5]) ?? "";     // C[5]
      const awayScore = toNum(lastRow[10]);            // C[10]
      const homeScore = toNum(lastRow[11]);            // C[11]
      const gameNum   = toNum(firstRow[4]);            // C[4]

      // 重複チェック: 日付範囲 + チーム名 + game_number で判定
      // timestamptz は .eq() で時刻付き値にマッチしないため範囲フィルターを使用
      const [dy, dm, dd] = dateStr.split("-").map(Number);
      const nextDateStr = new Date(Date.UTC(dy, dm - 1, dd + 1)).toISOString().slice(0, 10);
      let dupQuery = supabaseAdmin
        .from("games")
        .select("id")
        .gte("date", `${dateStr}T00:00:00.000Z`)
        .lt("date", `${nextDateStr}T00:00:00.000Z`)
        .eq("away_team", awayTeam)
        .eq("home_team", homeTeam);
      if (gameNum !== null) {
        dupQuery = dupQuery.eq("game_number", gameNum);
      }
      const { data: existing } = await dupQuery.maybeSingle();

      if (existing) {
        skippedGames++;
        continue;
      }

      // 試合を挿入
      const { data: game, error: gameError } = await supabaseAdmin
        .from("games")
        .insert({
          date:        gameDate,
          season:      toStr(firstRow[1]),      // C[1]
          kind:        toStr(firstRow[2]),       // C[2]
          week:        toNum(firstRow[3]),       // C[3]
          game_number: gameNum,                  // C[4]
          away_team:   awayTeam,
          home_team:   homeTeam,
          away_score:  awayScore,
          home_score:  homeScore,
          scorekeeper: toStr(lastRow[41]),       // C[41]
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // 投球データを生成
      const pitches = gameRows.map((row) => ({
        game_id:         game.id,
        play_number:     toNum(row[7]),   // C[7]
        inning:          toNum(row[8]),   // C[8]
        top_bottom:      toStr(row[9]),   // C[9]
        pa_complete:     toStr(row[15]),  // C[15]
        outs:            toNum(row[14]),  // C[14]
        balls:           toNum(row[13]),  // C[13]
        strikes:         toNum(row[12]),  // C[12]
        batter_name:     toStr(row[20]),  // C[20]
        batter_order:    toNum(row[19]),  // C[19]
        batter_hand:     toStr(row[21]),  // C[21]
        pitcher_name:    toStr(row[25]),  // C[25]
        pitcher_hand:    toStr(row[26]),  // C[26]
        catcher_name:    toStr(row[28]),  // C[28]
        runner_1st:      toStr(row[16]),  // C[16]
        runner_2nd:      toStr(row[17]),  // C[17]
        runner_3rd:      toStr(row[18]),  // C[18]
        pitch_type:      toStr(row[31]),  // C[31]
        pitch_speed:     toInt(row[40]),  // C[40]
        course_x:        toNum(row[29]),  // C[29]
        course_y:        toNum(row[30]),  // C[30]
        pitch_count:     toNum(row[27]),  // C[27]
        batting_result:  toStr(row[32]),  // C[32]
        batting_result2: toStr(row[33]),  // C[33]
        hit_type:        toStr(row[35]),  // C[35]
        hit_strength:    toStr(row[36]),  // C[36]
        hit_x:           toNum(row[37]),  // C[37]
        hit_y:           toNum(row[38]),  // C[38]
        strategy:        toStr(row[22]),  // C[22]
        strategy2:       toStr(row[23]),  // C[23]
        strategy_result: toStr(row[24]),  // C[24]
        error_type:      toStr(row[39]),  // C[39]
        fielder:         toStr(row[34]),  // C[34]
        offense_team:    toStr(row[42]),  // C[42]
      }));

      const BATCH_SIZE = 200;
      for (let i = 0; i < pitches.length; i += BATCH_SIZE) {
        const batch = pitches.slice(i, i + BATCH_SIZE);
        const { error: pitchError } = await supabaseAdmin
          .from("pitches")
          .insert(batch);
        if (pitchError) throw pitchError;
      }

      await supabaseAdmin.from("game_uploads").insert({
        game_id:     game.id,
        file_name:   file_name ?? "unknown.xlsx",
        uploaded_by: user.id,
      });

      insertedGames++;
      totalPitches += pitches.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        inserted_games: insertedGames,
        skipped_games:  skippedGames,
        pitches_count:  totalPitches,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in import-game-excel:", error);
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === "object" && "message" in error) {
      errorMessage = String((error as any).message);
      if ((error as any).details) errorMessage += ` / ${(error as any).details}`;
      if ((error as any).hint) errorMessage += ` / hint: ${(error as any).hint}`;
    } else {
      errorMessage = JSON.stringify(error);
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
