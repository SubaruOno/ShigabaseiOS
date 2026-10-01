import { isUuid, playMutationId } from "./local-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalGame, localStore } from "@/lib/scoring/local-store";
import { scoreLine, toAnalysisPitches } from "@/lib/scoring/to-pitches";
import { stateAt, teamSetupsFromLineup } from "@/lib/scoring/engine";

type Lineup = { team_id: string; slot: number; roster_player_id: string; position_id: number; batting_hand?: string | null; throwing_hand?: string | null; uniform_no?: string | null; ohtani_rule?: boolean; player_snapshot?: Record<string, any> };

export async function syncScoringGame(game: LocalGame, userId: string, supabase: SupabaseClient) {
  const plays = await localStore.plays(game.id);
  const deviceId = await localStore.deviceId();
  const localPlayers = [...await localStore.rosterPlayers(game.away_team_id), ...await localStore.rosterPlayers(game.home_team_id)];
  const playerIdMap = new Map<string, string>();
  for (const player of localPlayers.filter(p => p.provisional && String(p.id).startsWith("local-"))) {
    const id = String(player.sync_id ?? uuid());
    player.sync_id = id;
    await localStore.saveRosterPlayers(String(player.team_id), (await localStore.rosterPlayers(String(player.team_id))).map(row => row.id === player.id ? player : row));
    const { data, error } = await supabase.from("scoring_roster_players").insert({ id, team_id: player.team_id, name: player.name, name_s: player.name_s ?? "", name_e: player.name_e ?? "", name_es: player.name_es ?? "", throw_hand: player.throw_hand ?? "R", bat_hand: player.bat_hand ?? "R", primary_position_id: player.primary_position_id ?? 10, show_index: Number(player.show_index ?? player.uniform_no ?? 0), retired: false }).select("id").single();
    let syncedId = data?.id;
    if (error?.code === "23505" || error?.code === "PGRST116") {
      const existing = await supabase.from("scoring_roster_players").select("id").eq("id",id).single();
      if (existing.error) throw new Error(`仮登録選手「${player.name}」を同期できませんでした: ${error.message}`);
      syncedId = existing.data.id;
    } else if (error) throw new Error(`仮登録選手「${player.name}」を同期できませんでした: ${error.message}`);
    const career = await supabase.from("scoring_player_careers").select("id").eq("roster_player_id",syncedId).eq("team_id",player.team_id).eq("uniform_no",String(player.uniform_no ?? player.show_index ?? "")).maybeSingle();
    if(career.error) throw new Error(`仮登録選手「${player.name}」の背番号を確認できませんでした: ${career.error.message}`);
    if(!career.data){const careers = await supabase.from("scoring_player_careers").insert({ roster_player_id: syncedId, team_id: player.team_id, start_date: game.game_date, uniform_no: String(player.uniform_no ?? player.show_index ?? "") });if (careers.error) throw new Error(`仮登録選手「${player.name}」の背番号を同期できませんでした: ${careers.error.message}`);}
    playerIdMap.set(String(player.id), syncedId!);
    await localStore.replaceLocalPlayerId(String(player.id), syncedId!);
  }
  const remapPlayer = (row: any) => {
    const oldId = String(row.roster_player_id ?? row.player_snapshot?.id ?? "");
    const id = playerIdMap.get(oldId) ?? row.roster_player_id;
    const player = localPlayers.find(p => String(p.id) === oldId);
    return { ...row, roster_player_id: id, player_snapshot: player ? { ...player, id } : row.player_snapshot };
  };
  const lineup = ((game.lineup ?? []) as Lineup[]).map(remapPlayer);

  const { error: gameError } = await supabase.from("scoring_games").upsert({ id: game.id, display_game_number: game.display_game_number, game_date: game.game_date, game_time: game.game_time, stadium_id: game.stadium_id ?? null, weather_id: game.weather_id ?? null, method: game.method, home_team_id: game.home_team_id, away_team_id: game.away_team_id, season: game.season, kind: game.kind, week: game.week, day: game.day, game_number: game.game_number, umpire: game.umpire ?? null, tags: game.tags, status: game.status, created_by: userId }, { onConflict: "id" });
  if (gameError) throw new Error(`試合情報を同期できませんでした: ${gameError.message}`);
  if (lineup.length) {
    const { error } = await supabase.from("scoring_lineups").upsert(lineup.map(row => ({ game_id: game.id, ...row })), { onConflict: "game_id,team_id,slot" });
    if (error) throw new Error(`先発メンバーを同期できませんでした: ${error.message}`);
  }
  const { error: playError } = await supabase.from("scoring_plays").upsert(plays.map(p => ({ game_id: game.id, seq: p.seq, input_event: p.page, page_state: {}, client_mutation_id: isUuid(p.client_mutation_id) ? p.client_mutation_id : playMutationId(game.id, p.seq), device_id: deviceId })), { onConflict: "game_id,client_mutation_id" });
  if (playError) throw new Error(`プレイを同期できませんでした: ${playError.message}`);

  // ローカルのページに記録された選手交代を正規化して同期する。
  const substitutions: any[] = [];
  const setupByTeam = new Map<string, Lineup[]>();
  for (const row of lineup) setupByTeam.set(row.team_id, [...setupByTeam.get(row.team_id) ?? [], row]);
  const currentIds: Record<0|1, Map<number,string>> = { 0: new Map(), 1: new Map() };
  for (const side of [0,1] as const) for (const row of setupByTeam.get(side === 0 ? game.away_team_id : game.home_team_id) ?? []) currentIds[side].set(row.slot, row.roster_player_id);
  // 交代が何回の表裏かは、そのページの直前の状況から求める
  const setups = teamSetupsFromLineup(lineup as any, [game.away_team_id, game.home_team_id], [game.away_name ?? "", game.home_name ?? ""]);
  for (const [index, play] of plays.entries()) {
    const at = (play.page.subs ?? []).length ? stateAt(index, plays.map(x => x.page), setups) : null;
    for (const sub of play.page.subs ?? []) {
      const teamId = sub.t === 0 ? game.away_team_id : game.home_team_id;
      const prior = currentIds[sub.t].get(sub.slot === "P" ? 10 : sub.slot + 1) ?? null;
      const incomingNo = sub.no == null ? null : String(sub.no);
      const candidate = lineup.find(row => row.team_id === teamId && String(row.uniform_no ?? row.player_snapshot?.uniform_no ?? row.player_snapshot?.show_index) === incomingNo);
      const local = localPlayers.find(row => row.team_id === teamId && String(row.uniform_no ?? row.show_index) === incomingNo);
      // 背番号なしの交代は、同じ選手の守備位置だけの変更
      const incoming = incomingNo == null ? prior ?? undefined : candidate?.roster_player_id ?? (local ? playerIdMap.get(String(local.id)) ?? local.id : undefined);
      if (!incoming) throw new Error(`第${index+1}プレイの交代選手（背番号${incomingNo ?? "?"}）が見つかりません`);
      substitutions.push({ game_id: game.id, seq: play.seq, team_id: teamId, slot: sub.slot === "P" ? 10 : sub.slot + 1, replaced_player_id: prior, incoming_player_id: incoming, position_id: sub.pos ?? null, inning: at?.inn ?? 1, half: at?.half ?? sub.t });
      currentIds[sub.t].set(sub.slot === "P" ? 10 : sub.slot + 1, incoming);
    }
  }
  const { error: clearSubError } = await supabase.from("scoring_substitutions").delete().eq("game_id", game.id);
  if (clearSubError) throw new Error(`交代履歴を更新できませんでした: ${clearSubError.message}`);
  if (substitutions.length) { const { error } = await supabase.from("scoring_substitutions").insert(substitutions); if (error) throw new Error(`交代を同期できませんでした: ${error.message}`); }

  const [{ data: home, error: homeError }, { data: away, error: awayError }, { data: ballTypes, error: ballError }, { data: plans }, {data: positions}] = await Promise.all([
    supabase.from("opponent_teams").select("name").eq("id", game.home_team_id).single(),
    supabase.from("opponent_teams").select("name").eq("id", game.away_team_id).single(),
    supabase.from("scoring_ball_types").select("name,old_excel_label"),
    supabase.from("scoring_plans").select("id,name,old_excel_label"),
    supabase.from("scoring_positions").select("id,name"),
  ]);
  if (homeError || awayError || ballError) throw new Error(`分析用データのマスターを読み込めませんでした: ${homeError?.message ?? awayError?.message ?? ballError?.message}`);
  const homeName = home?.name ?? game.home_name ?? "";
  const awayName = away?.name ?? game.away_name ?? "";
  const { data: linked, error: linkReadError } = await supabase.from("games").select("id").eq("scoring_game_id", game.id).maybeSingle();
  if (linkReadError) throw new Error(`分析用試合を確認できませんでした: ${linkReadError.message}`);
  let analysisGameId = linked?.id;
  if (!analysisGameId) {
    const {data: legacy} = await supabase.from("games").select("id").eq("date", game.game_date).eq("season",game.season).eq("kind",game.kind).eq("game_number",game.game_number).eq("home_team",homeName).eq("away_team",awayName).maybeSingle();
    analysisGameId = legacy?.id;
  }
  const lineScore = scoreLine({ plays, lineup, teamIds: [game.away_team_id,game.home_team_id], teamNames: [awayName,homeName] });
  const gameRow = { scoring_game_id: game.id, date: `${game.game_date}T${game.game_time}:00`, season: game.season, kind: game.kind, week: Number(game.week), game_number: game.game_number, away_team: awayName, home_team: homeName, away_score: lineScore.awayScore, home_score: lineScore.homeScore, away_runs_per_inning: lineScore.awayRunsPerInning, home_runs_per_inning: lineScore.homeRunsPerInning, scorekeeper: game.umpire ?? null };
  if (analysisGameId) { const {error} = await supabase.from("games").update(gameRow).eq("id",analysisGameId); if(error)throw new Error(`分析用試合を更新できませんでした: ${error.message}`); }
  else { const {data,error}=await supabase.from("games").insert(gameRow).select("id").single();if(error)throw new Error(`分析用試合を作成できませんでした: ${error.message}`);analysisGameId=data.id; }
  const {error:deleteError}=await supabase.from("pitches").delete().eq("game_id",analysisGameId);if(deleteError)throw new Error(`分析用投球を置き換えできませんでした: ${deleteError.message}`);
  const teamNames: [string,string] = [awayName,homeName];
  const planNames = Object.fromEntries((plans ?? []).map(p => [String(p.id), p.old_excel_label || p.name]));
  const positionNames = Object.fromEntries((positions ?? []).map(p => [String(p.id), p.name]));
  const rows = toAnalysisPitches({ gameId: analysisGameId, plays, lineup, teamIds: [game.away_team_id,game.home_team_id], teamNames, gameDate:game.game_date,gameTime:game.game_time,season:game.season,kind:game.kind,week:game.week,day:game.day,gameNumber:game.game_number,umpire:game.umpire,ballTypes:ballTypes??[],planNames,positionNames });
  if(rows.length){const {error}=await supabase.from("pitches").insert(rows);if(error)throw new Error(`分析用投球を保存できませんでした: ${error.message}`);}
  const all = await localStore.games();
  await localStore.saveGames(all.map(g => g.id === game.id ? { ...g, synced_at: new Date().toISOString() } : g));
}
function uuid() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }); }
