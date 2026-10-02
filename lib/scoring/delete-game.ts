import type { SupabaseClient } from "@supabase/supabase-js";
import { localStore } from "@/lib/scoring/local-store";
import { failAfter, withTimeout } from "@/lib/scoring/net";

// 試合を消す。サーバーにある試合は先にサーバーから消し、成功してから端末からも消す（途中で失敗しても端末の記録は残る）
// - 試合記録（scoring_games）を消すと、打順・プレイ・交代・変更記録もいっしょに消える（ON DELETE CASCADE）
// - 試合結果（games）の行は、同期で新しく作った行だけ消す。旧Excelから取り込んだ試合とつながった行は消さず、つながりだけ外す
export async function deleteScoringGame(gameId: string, supabase: SupabaseClient, onServer: boolean) {
  // 端末の印だけでは分からない（同期のあとに直して「未同期」に戻った試合など）ので、つながるときはサーバーにあるかも確かめる
  if (!onServer) {
    const { data, error } = await withTimeout(supabase.from("scoring_games").select("id").eq("id", gameId).maybeSingle());
    if (!error && data) onServer = true;
  }
  if (onServer) await failAfter(deleteOnServer(gameId, supabase), 60000, "サーバーにつながりませんでした。電波のある所でもう一度削除してください");
  const games = await localStore.games();
  await localStore.saveGames(games.filter(g => g.id !== gameId));
  await localStore.savePlays(gameId, []);
  await localStore.saveDraft(gameId, null);
}

async function deleteOnServer(gameId: string, supabase: SupabaseClient) {
  const { data: sg, error: sgError } = await supabase.from("scoring_games").select("id,created_at").eq("id", gameId).maybeSingle();
  if (sgError) throw new Error(`試合を確認できませんでした: ${sgError.message}`);
  const { data: linked, error: linkError } = await supabase.from("games").select("id,created_at").eq("scoring_game_id", gameId);
  if (linkError) throw new Error(`試合結果を確認できませんでした: ${linkError.message}`);
  for (const row of linked ?? []) {
    const fromLegacy = sg && new Date(row.created_at).getTime() < new Date(sg.created_at).getTime();
    if (fromLegacy) {
      const { data, error } = await supabase.from("games").update({ scoring_game_id: null }).eq("id", row.id).select("id");
      if (error || !data?.length) throw new Error(`旧Excelの試合とのつながりを外せませんでした${error ? `: ${error.message}` : "（権限がありません）"}`);
      continue;
    }
    const { error: pError } = await supabase.from("pitches").delete().eq("game_id", row.id);
    if (pError) throw new Error(`試合結果の投球を消せませんでした: ${pError.message}`);
    const { data, error } = await supabase.from("games").delete().eq("id", row.id).select("id");
    if (error || !data?.length) throw new Error(`試合結果を消せませんでした${error ? `: ${error.message}` : "（権限がありません。アナリストか管理者のアカウントで削除してください）"}`);
  }
  if (sg) {
    const { data, error } = await supabase.from("scoring_games").delete().eq("id", gameId).select("id");
    if (error || !data?.length) throw new Error(`試合記録を消せませんでした${error ? `: ${error.message}` : "（権限がありません。アナリストか管理者のアカウントで削除してください）"}`);
  }
}
