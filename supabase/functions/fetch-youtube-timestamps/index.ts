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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "認証エラー" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { video_id, game_id, youtube_url } = await req.json();
    if (!video_id) {
      return new Response(JSON.stringify({ error: "video_id が必要です" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "YOUTUBE_API_KEY が設定されていません" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video_id}&key=${apiKey}`;
    const ytRes = await fetch(ytUrl);
    if (!ytRes.ok) {
      return new Response(JSON.stringify({ error: `YouTube API エラー: ${ytRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ytData = await ytRes.json();
    const description: string = ytData.items?.[0]?.snippet?.description ?? "";

    // Parse lines like "0:00 1回表", "1:23 2回裏", "1:23:45 10回表"
    const regex = /(\d+):(\d+)(?::(\d+))?\s+(\d+)回([表裏])/g;
    const timestamps: { inning: number; top_bottom: string; seconds: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(description)) !== null) {
      const [, a, b, c, inningStr, topBottom] = match;
      let seconds: number;
      if (c !== undefined) {
        seconds = parseInt(a) * 3600 + parseInt(b) * 60 + parseInt(c);
      } else {
        seconds = parseInt(a) * 60 + parseInt(b);
      }
      timestamps.push({ inning: parseInt(inningStr), top_bottom: topBottom, seconds });
    }

    // game_id が渡されていればDB書き込みもここで行う（サービスロールで RLS をバイパス）
    if (game_id && youtube_url) {
      if (timestamps.length > 0) {
        const rows = timestamps.map((ts) => ({
          game_id,
          inning: ts.inning,
          top_bottom: ts.top_bottom,
          seconds: ts.seconds,
        }));
        const { error: upsertError } = await supabase
          .from("game_inning_timestamps")
          .upsert(rows, { onConflict: "game_id,inning,top_bottom" });
        if (upsertError) {
          return new Response(JSON.stringify({ error: upsertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: updateError } = await supabase
        .from("games")
        .update({ youtube_url })
        .eq("id", game_id);
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ timestamps, count: timestamps.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
