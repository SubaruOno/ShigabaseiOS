import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ウエイト記録リマインド通知
 * - 毎月1日: 全選手に「今月の入力をお願いします」
 * - 毎日（2日以降）: 未入力の選手だけにリマインド
 * Supabase Cron から毎日 09:00 JST (00:00 UTC) に呼び出す
 */
Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const dayOfMonth = jstNow.getUTCDate();
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;

    // 今月の範囲
    const curStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const curEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const isFirstDay = dayOfMonth === 1;

    // 今月すでに入力済みの player_id を取得
    const { data: submitted } = await supabase
      .from("weight_sessions")
      .select("player_id")
      .gte("recorded_at", curStart)
      .lt("recorded_at", curEnd);

    const submittedIds = new Set((submitted ?? []).map((s: { player_id: string }) => s.player_id));

    // 全選手と user_id を取得
    const { data: players } = await supabase
      .from("players")
      .select("id, name, user_id");

    if (!players || players.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no players" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 未入力の選手の user_id を抽出
    const targetUserIds = players
      .filter((p: { id: string; user_id: string | null }) =>
        p.user_id && !submittedIds.has(p.id)
      )
      .map((p: { user_id: string }) => p.user_id);

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "all submitted" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 対象の push token を取得
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token")
      .in("user_id", targetUserIds);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no tokens" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const monthLabel = `${month}月`;
    const title = isFirstDay
      ? `${monthLabel}のウエイト記録を入力してください`
      : `【リマインド】${monthLabel}のウエイト記録が未入力です`;
    const body = isFirstDay
      ? "今月のトレーニング記録をアプリから入力しましょう"
      : `残り${targetUserIds.length}名が未入力です。忘れずに記録してください`;

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title,
      body,
      data: { type: "weight_reminder" },
      sound: "default",
    }));

    // Expo Push API へ送信
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    const result = await res.json();

    return new Response(
      JSON.stringify({ sent: tokens.length, isFirstDay, targetCount: targetUserIds.length, result }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
