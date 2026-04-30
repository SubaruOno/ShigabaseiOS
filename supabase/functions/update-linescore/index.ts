import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "認証エラー" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "認証エラー" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Single game update by ID (from in-app score editor)
    if (body.game_id) {
      const awayRuns: number[] = body.away_runs;
      const homeRuns: number[] = body.home_runs;
      const awayScore = awayRuns.reduce((s: number, v: number) => s + v, 0);
      const homeScore = homeRuns.reduce((s: number, v: number) => s + v, 0);

      const { error } = await supabase
        .from("games")
        .update({
          away_runs_per_inning: awayRuns,
          home_runs_per_inning: homeRuns,
          away_score: awayScore,
          home_score: homeScore,
        })
        .eq("id", body.game_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ updated: 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bulk update by date + game_number (from Excel import)
    const updates: Array<{
      game_date: string;
      game_number: number;
      away_runs: number[];
      home_runs: number[];
    }> = body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ error: "updates 配列が必要です" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let skipped = 0;
    for (const u of updates) {
      const awayScore = u.away_runs.reduce((s: number, v: number) => s + v, 0);
      const homeScore = u.home_runs.reduce((s: number, v: number) => s + v, 0);
      // date カラムは timestamptz のため .eq() では時刻部分がある場合にマッチしない
      // 1日分の範囲フィルターで確実にマッチさせる
      const [y, m, d] = u.game_date.split("-").map(Number);
      const nextDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);

      // まず対象試合を SELECT で特定する
      let selectQuery = supabase
        .from("games")
        .select("id, away_score, home_score")
        .gte("date", `${u.game_date}T00:00:00.000Z`)
        .lt("date", `${nextDate}T00:00:00.000Z`);
      if (u.game_number != null) {
        selectQuery = selectQuery.eq("game_number", u.game_number);
      }
      const { data: candidates, error: selectError } = await selectQuery;

      if (selectError || !candidates || candidates.length === 0) {
        skipped++;
        continue;
      }

      // 複数ヒット時はスコアで絞り込む
      let matched = candidates;
      if (matched.length > 1) {
        const byScore = matched.filter(
          (g: { away_score: number | null; home_score: number | null }) =>
            g.away_score === awayScore && g.home_score === homeScore
        );
        if (byScore.length >= 1) matched = byScore;
      }

      // 1件に絞れなければスキップ
      if (matched.length !== 1) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from("games")
        .update({
          away_runs_per_inning: u.away_runs,
          home_runs_per_inning: u.home_runs,
          away_score: awayScore,
          home_score: homeScore,
        })
        .eq("id", matched[0].id);

      if (!error) updated++;
    }

    return new Response(JSON.stringify({ updated, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
