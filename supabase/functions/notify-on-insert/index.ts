import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// DB webhook から呼ばれる Edge Function
// documents / videos テーブルへの INSERT 時に全ユーザーへプッシュ通知を送信する
Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Supabase DB webhook payload: { table: string, record: { title, category_id, ... } }
    const { table, record } = await req.json();

    if (!table || !record) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let contentType: "document" | "video" | "practice_video" | "game";
    let notifTitle: string;
    let notifBody: string;

    if (table === "documents") {
      contentType = "document";
      notifTitle = "新しいコンテンツが追加されました";
      notifBody = record.title ?? "";
    } else if (table === "videos") {
      // カテゴリの page_type を確認して practice_video か video か判定する
      const { data: category } = await supabase
        .from("categories")
        .select("page_type")
        .eq("id", record.category_id)
        .single();
      contentType = category?.page_type === "scores" ? "practice_video" : "video";
      notifTitle = "新しいコンテンツが追加されました";
      notifBody = record.title ?? "";
    } else if (table === "games") {
      contentType = "game";
      notifTitle = "試合データが追加されました";
      const date = record.date ? record.date.slice(0, 10) : "";
      const away = record.away_team ?? "";
      const home = record.home_team ?? "";
      notifBody = date ? `${date} ${away} vs ${home}` : `${away} vs ${home}`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown table" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 全ユーザーの push token を取得
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token");

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Expo Push API へ送信
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: notifTitle,
      body: notifBody,
      data: { type: "content", contentType },
    }));

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    return new Response(JSON.stringify({ sent: tokens.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
