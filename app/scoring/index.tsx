import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { LocalGame, localStore } from "@/lib/scoring/local-store";
import { export191Row } from "@/lib/scoring/export191";
import { stateAt, teamSetupsFromLineup } from "@/lib/scoring/engine";

const tabs = ["試合", "マスタ"] as const;
const masterTabs = ["チーム", "選手", "球場", "カテゴリ", "球種", "結果", "作戦", "メモ"] as const;
const masterTables: Record<(typeof masterTabs)[number], string> = { チーム: "opponent_teams", 選手: "scoring_roster_players", 球場: "scoring_stadiums", カテゴリ: "scoring_categories", 球種: "scoring_ball_types", 結果: "scoring_results", 作戦: "scoring_plans", メモ: "scoring_memos" };
const text = (v: unknown) => typeof v === "string" ? v : v == null ? "" : String(v);
const newId = () => `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
export default function ScoringHome() {
  const { user, isLoading, hasRole } = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number]>("試合");
  const [games, setGames] = useState<LocalGame[]>([]);
  const [remoteGames, setRemoteGames] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [masterTab, setMasterTab] = useState<(typeof masterTabs)[number]>("チーム");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [retiredVisible, setRetiredVisible] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [playersForCreate, setPlayersForCreate] = useState<any[]>([]);
  const allowed = hasRole("analyst") || hasRole("admin");
  const refresh = async () => {
    setGames(await localStore.games());
    const { data } = await supabase.from("scoring_games").select("id,display_game_number,game_date,game_time,status,tags,method,home_team_id,away_team_id").order("game_date", { ascending: false }).limit(100);
    setRemoteGames(data ?? []);
  };
  useEffect(() => { if (allowed) refresh().catch(() => {}); }, [allowed]);
  useEffect(() => { if (tab !== "マスタ") return; const table = masterTables[masterTab]; supabase.from(table).select("*").limit(200).then(({ data }) => setMasters(data ?? [])); }, [tab, masterTab]);
  const sync = async (game: LocalGame) => {
    setBusy(true);
    try {
      const { error: gameError } = await supabase.from("scoring_games").upsert({ id: game.id, display_game_number: game.display_game_number, game_date: game.game_date, game_time: game.game_time, stadium_id: game.stadium_id ?? null, weather_id: game.weather_id ?? null, method: game.method, home_team_id: game.home_team_id, away_team_id: game.away_team_id, season: game.season, kind: game.kind, week: game.week, day: game.day, game_number: game.game_number, umpire: game.umpire ?? null, tags: game.tags, status: game.status, created_by: user!.id }, { onConflict: "id" });
      if (gameError) throw gameError;
      if (game.lineup?.length) { const { error: lineupError } = await supabase.from("scoring_lineups").upsert(game.lineup.map((row:any) => ({game_id:game.id,...row})), {onConflict:"game_id,team_id,slot"}); if(lineupError) throw lineupError; }
      const plays = await localStore.plays(game.id);
      if (plays.length) {
        const device = await localStore.deviceId();
        const { error } = await supabase.from("scoring_plays").upsert(plays.map(p => ({ game_id: game.id, seq: p.seq, input_event: p.page, page_state: {}, client_mutation_id: p.client_mutation_id, device_id: device })), { onConflict: "game_id,client_mutation_id" });
        if (error) throw error;
      }
      const [{ data: home }, { data: away }] = await Promise.all([
        supabase.from("opponent_teams").select("name").eq("id", game.home_team_id).single(),
        supabase.from("opponent_teams").select("name").eq("id", game.away_team_id).single(),
      ]);
      const existingLegacy = await supabase.from("games").select("id").eq("date", `${game.game_date}T00:00:00`).eq("season", game.season).eq("kind", game.kind).eq("game_number", game.game_number).maybeSingle();
      if (!existingLegacy.data) {
        const { error: legacyError } = await supabase.from("games").insert({ id: game.id, date: `${game.game_date}T${game.game_time}:00`, season: game.season, kind: game.kind, week: Number(game.week), game_number: game.game_number, away_team: away?.name ?? game.away_name ?? "", home_team: home?.name ?? game.home_name ?? "", scorekeeper: game.umpire ?? null });
        if (legacyError) throw legacyError;
      } else {
        const { error: legacyUpdateError } = await supabase.from("games").update({ date: `${game.game_date}T${game.game_time}:00`, away_team: away?.name ?? game.away_name ?? "", home_team: home?.name ?? game.home_name ?? "", scorekeeper: game.umpire ?? null }).eq("id", existingLegacy.data.id);
        if (legacyUpdateError) throw legacyUpdateError;
      }
      const { error: pitchDeleteError } = await supabase.from("pitches").delete().eq("game_id", game.id);
      if (pitchDeleteError) throw pitchDeleteError;
      if (plays.length) {
        const rows = plays.map((play,index) => { const st=stateAt(index,plays.map(x=>x.page),teamSetupsFromLineup(game.lineup as any,[game.away_team_id,game.home_team_id],[game.away_name??"",game.home_name??""])); const teamNames:[string,string]=[away?.name??game.away_name??"",home?.name??game.home_name??""]; const setup=teamSetupsFromLineup(game.lineup as any,[game.away_team_id,game.home_team_id],teamNames); const lineupNames:[string[],string[]]=[setup[0].order.map(no=>String((game.lineup as any[]).find(x=>x.team_id===game.away_team_id&&Number(x.uniform_no)===no)?.player_snapshot?.name??"")),setup[1].order.map(no=>String((game.lineup as any[]).find(x=>x.team_id===game.home_team_id&&Number(x.uniform_no)===no)?.player_snapshot?.name??""))]; const lineupPositions:[string[],string[]]=[setup[0].pos.map(String),setup[1].pos.map(String)]; const hands:[string[],string[]]=[setup[0].bats.map(x=>x==="左"?"L":x==="両"?"S":"R"),setup[1].bats.map(x=>x==="左"?"L":x==="両"?"S":"R")]; const row=export191Row(st,play.page,{dateTime:`${game.game_date} ${game.game_time}:00`,season:game.season,kind:game.kind,week:game.week,day:game.day,gameNumber:game.game_number,homeTeam:teamNames[1],awayTeam:teamNames[0],umpire:game.umpire,pitcherNames:[String((game.lineup as any[]).find(x=>x.team_id===game.away_team_id&&x.slot===10)?.player_snapshot?.name??""),String((game.lineup as any[]).find(x=>x.team_id===game.home_team_id&&x.slot===10)?.player_snapshot?.name??"")],catcherNames:["",""],lineupNames,lineupPositions,hands,pitcherHands:[setup[0].throws==="左"?"L":"R",setup[1].throws==="左"?"L":"R"]},play.seq,{result:play.page.res?.label,pitchType:play.page.pitch_type??undefined,pitchSpeed:play.page.ball_speed?Number(play.page.ball_speed):undefined,course:play.page.course??undefined,ballXY:play.page.batted_ball?[play.page.batted_ball.x,play.page.batted_ball.y]:undefined}); return {game_id:game.id,play_number:Number(row[9])||play.seq,inning:Number(row[10])||1,top_bottom:String(row[11]||"表"),offense_team:String(row[182]||teamNames[0]),batter_order:Number(row[26])||null,batter_name:row[27]||null,batter_hand:row[28]||null,pitcher_name:row[32]||null,pitcher_hand:row[33]||null,catcher_name:row[35]||null,runner_1st:row[21]||null,runner_2nd:row[23]||null,runner_3rd:row[25]||null,balls:Number(row[14])||0,strikes:Number(row[13])||0,outs:Number(row[15])||0,pa_complete:row[17]||null,pitch_count:Number(row[34])||null,pitch_type:row[44]||null,pitch_speed:Number(row[55])||null,course_x:Number(row[42])||null,course_y:Number(row[43])||null,batting_result:row[45]||null,batting_result2:row[46]||null,hit_type:row[47]||null,hit_strength:row[48]||null,hit_x:Number(row[49])||null,hit_y:Number(row[50])||null,strategy:row[29]||null,strategy2:row[30]||null,strategy_result:row[31]||null,error_type:row[53]||null,fielder:row[46]||null}; });
        const { error: pitchInsertError } = await supabase.from("pitches").insert(rows);
        if (pitchInsertError) throw pitchInsertError;
      }
      await refresh(); Alert.alert("同期しました", `${plays.length}件のプレイを同期しました`);
    } catch (e) { Alert.alert("同期できません", String(e)); } finally { setBusy(false); }
  };
  const startGame = async () => {
    const [{ data: teamRows }, { data: stadiums }, { data: weather }, { data: players }] = await Promise.all([
      supabase.from("opponent_teams").select("id,name,is_own_team").order("display_order"),
      supabase.from("scoring_stadiums").select("id,name").limit(100),
      supabase.from("scoring_weather").select("id,name").order("show_index"),
      supabase.from("scoring_roster_players").select("id,name,team_id,primary_position_id,bat_hand,throw_hand,retired,show_index").order("show_index"),
    ]);
    if (!teamRows || teamRows.length < 2) { Alert.alert("チームがありません", "先にマスタ管理でチームを登録してください"); return; }
    const now=new Date(),pad=(n:number)=>String(n).padStart(2,"0"),iso=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`,tm=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const own=teamRows.find(t=>t.is_own_team)??teamRows[0],away=teamRows.find(t=>t.id!==own.id)!;
    const make=(team:any)=>Array.from({length:9},(_,i)=>({roster_player_id:"",position_id:[1,2,3,4,5,6,7,8,9][i],slot:i+1}));
    const lineups:{[key:string]:any[]}={[own.id]:make(own),[away.id]:make(away)};
    for(const team of [own,away]){const candidates=(players??[]).filter(p=>p.team_id===team.id&&!p.retired).slice(0,9);candidates.forEach((pl,i)=>{lineups[team.id][i]={...lineups[team.id][i],roster_player_id:pl.id,position_id:pl.primary_position_id??i+1}});}
    const pitcherFor=(team:any)=>((players??[]).find(p=>p.team_id===team.id&&!p.retired&&p.primary_position_id===1)??(players??[]).find(p=>p.team_id===team.id&&!p.retired))?.id??"";
    setPlayersForCreate(players??[]);setDraft({teamRows,ownId:own.id,awayId:away.id,homeId:own.id,awayTeamId:away.id,lineups,pitchers:{[own.id]:pitcherFor(own),[away.id]:pitcherFor(away)},stadium:stadiums?.[0],weather:weather?.[0],iso,tm,ohtani:false,retiredVisible:false});setCreateOpen(true);
  };
  const recentLineup=async(teamId:string)=>{
    const {data:gamesRecent}=await supabase.from("scoring_games").select("id,game_date").or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`).order("game_date",{ascending:false}).limit(20);
    if(!gamesRecent?.length){Alert.alert("過去の試合がありません");return}
    const {data:rows}=await supabase.from("scoring_lineups").select("*").eq("team_id",teamId).in("game_id",gamesRecent.map(g=>g.id)).order("slot");
    const old=rows?.filter(r=>r.game_id===gamesRecent[0].id)??[];const eligible=new Set(playersForCreate.filter(p=>p.team_id===teamId&&!p.retired).map(p=>p.id));const slots=Array.from({length:9},(_,i)=>{const r=old.find(x=>x.slot===i+1);return r&&eligible.has(r.roster_player_id)?{roster_player_id:r.roster_player_id,position_id:r.position_id,slot:i+1}:{roster_player_id:"",position_id:i===0?1:i+1,slot:i+1}});setDraft((d:any)=>({...d,lineups:{...d.lineups,[teamId]:slots},pitchers:{...d.pitchers,[teamId]:old.find(r=>r.slot===10&&eligible.has(r.roster_player_id))?.roster_player_id??d.pitchers[teamId]}}));
  };
  const createGame=async()=>{
    if(!draft)return;const ids=[draft.awayTeamId,draft.homeId];
    for(const tid of ids){const rows=draft.lineups[tid]??[];if(rows.length!==9||rows.some((r:any)=>!r.roster_player_id)){Alert.alert("打順が未完成です","両チームの1〜9番を選んでください");return}if(new Set(rows.map((r:any)=>r.roster_player_id)).size!==9){Alert.alert("選手が重複しています","同じ選手を複数の打順に登録できません");return}if(!draft.pitchers[tid]){Alert.alert("投手を選択してください");return}}
    const id=newId(),displayNo=`${draft.iso.replaceAll("-","")}${draft.tm.replace(":","")}`,season=String(new Date(draft.iso).getFullYear());const lineup:any[]=[];
    for(const teamId of ids){const batting=draft.lineups[teamId].map((row:any)=>({...row}));const pitcherId=draft.pitchers[teamId];const pitcher=playersForCreate.find(x=>x.id===pitcherId);let ohtani=false;if(draft.ohtani){const dual=batting.find((row:any)=>row.roster_player_id===pitcherId);if(dual){dual.position_id=10;ohtani=true}}for(const row of batting){const pl=playersForCreate.find(x=>x.id===row.roster_player_id);lineup.push({team_id:teamId,slot:row.slot,roster_player_id:pl.id,position_id:row.position_id,batting_hand:pl.bat_hand==="S"?"R":pl.bat_hand,throwing_hand:pl.throw_hand,uniform_no:String(pl.show_index??row.slot),ohtani_rule:ohtani,player_snapshot:pl})}lineup.push({team_id:teamId,slot:10,roster_player_id:pitcherId,position_id:1,batting_hand:pitcher.bat_hand==="S"?"R":pitcher.bat_hand,throwing_hand:pitcher.throw_hand,uniform_no:String(pitcher.show_index??1),ohtani_rule:ohtani,player_snapshot:pitcher})}
    const game:LocalGame={id,display_game_number:displayNo,game_date:draft.iso,game_time:draft.tm,stadium_id:draft.stadium?.id??null,weather_id:draft.weather?.id,home_team_id:draft.homeId,away_team_id:draft.awayTeamId,home_name:draft.teamRows.find((x:any)=>x.id===draft.homeId)?.name,away_name:draft.teamRows.find((x:any)=>x.id===draft.awayTeamId)?.name,season,kind:"練習試合",week:"1",day:"1",game_number:1,method:"live",tags:[],status:"in_progress",lineup,ohtani_rule:draft.ohtani};
    const existing=await localStore.games();if(existing.some(g=>g.status==="in_progress")){Alert.alert("試合が進行中です","先に進行中の試合を保存して閉じてください");return}await localStore.saveGames([game,...existing]);setGames([game,...existing]);setCreateOpen(false);router.push(`/scoring/${id}` as any);
  };
  if (isLoading) return <View style={s.center}><Text>読み込み中…</Text></View>;
  if (!user) return <Redirect href="/login" />;
  if (!allowed) return <Redirect href="/(tabs)" />;
  return <ScrollView style={s.page} contentContainerStyle={s.wrap}>
    <Text style={s.title}>試合記録</Text>
    <View style={s.row}>{tabs.map(t => <TouchableOpacity key={t} style={[s.chip, tab === t && s.active]} onPress={() => setTab(t)}><Text style={tab===t?s.activeText:s.chipText}>{t}</Text></TouchableOpacity>)}</View>
    {tab === "試合" ? <>
      <TouchableOpacity style={s.primary} onPress={startGame}><Text style={s.primaryText}>＋ 新しい試合</Text></TouchableOpacity>
      {[...games, ...remoteGames.filter(r => !games.some(g => g.id===r.id))].map((g:any) => <View key={g.id} style={s.card}><View style={{flex:1}}><Text style={s.cardTitle}>{g.display_game_number}　{g.game_date}</Text><Text style={s.sub}>{g.status} · {g.method} · {(g.tags ?? []).join(" / ")}</Text></View><TouchableOpacity style={s.outline} onPress={() => g.game_date && g.lineup !== undefined ? router.push(`/scoring/${g.id}` as any) : sync(g)}><Text>{g.status === "in_progress" ? "続ける" : g.lineup !== undefined ? "開く" : "同期"}</Text></TouchableOpacity>{g.lineup !== undefined && <TouchableOpacity style={s.outline} disabled={busy} onPress={() => sync(g)}><Text>同期</Text></TouchableOpacity>}</View>)}
      {!games.length && !remoteGames.length && <Text style={s.sub}>試合はまだありません。</Text>}
    </> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{masterTabs.map(t=><TouchableOpacity key={t} style={[s.chip,masterTab===t&&s.active]} onPress={()=>setMasterTab(t)}><Text style={masterTab===t?s.activeText:s.chipText}>{t}</Text></TouchableOpacity>)}</ScrollView>
      <TouchableOpacity style={s.primary} onPress={() => router.push(`/scoring/master?kind=${encodeURIComponent(masterTab)}` as any)}><Text style={s.primaryText}>＋ {masterTab}を追加</Text></TouchableOpacity>
      {masters.map((item,i)=><TouchableOpacity key={text(item.id) || i} style={s.card} onPress={()=>router.push(`/scoring/master?kind=${encodeURIComponent(masterTab)}&id=${text(item.id)}` as any)}><View style={{flex:1}}><Text style={s.cardTitle}>{text(item.name) || text(item.name_s) || `#${item.id}`}</Text><Text style={s.sub}>{item.display_flag === false || item.retired ? "無効・引退" : "有効"}</Text></View><Text>編集 ›</Text></TouchableOpacity>)}
    </>}
    <Modal visible={createOpen} transparent animationType="slide" onRequestClose={()=>setCreateOpen(false)}><View style={{flex:1,backgroundColor:"#0008",justifyContent:"center",padding:18}}><View style={{backgroundColor:"white",padding:18,borderRadius:12,maxHeight:"94%",gap:10}}><Text style={s.title}>新しい試合・スタメン</Text><ScrollView>{draft&&[draft.awayTeamId,draft.homeId].map((teamId:string,ti:number)=><View key={teamId} style={{marginBottom:14}}><Text style={s.cardTitle}>{draft.teamRows.find((t:any)=>t.id===teamId)?.name}{ti===0?"（先攻）":"（後攻）"}</Text><View style={s.row}><TouchableOpacity style={s.outline} onPress={()=>recentLineup(teamId)}><Text>ラストオーダー</Text></TouchableOpacity><TouchableOpacity style={s.outline} onPress={()=>setRetiredVisible(!retiredVisible)}><Text>{retiredVisible?"引退選手を隠す":"退部済みを表示"}</Text></TouchableOpacity><Text>投手:</Text>{playersForCreate.filter(p=>p.team_id===teamId&&(retiredVisible||!p.retired)).map(p=><TouchableOpacity key={p.id} style={[s.chip,draft.pitchers[teamId]===p.id&&s.active]} onPress={()=>setDraft((d:any)=>({...d,pitchers:{...d.pitchers,[teamId]:p.id}}))}><Text style={draft.pitchers[teamId]===p.id?s.activeText:s.chipText}>{p.name}</Text></TouchableOpacity>)}</View>{draft.lineups[teamId].map((row:any,i:number)=><View key={i} style={[s.row,{alignItems:"center"}]}><Text style={{width:42}}>{i+1}番</Text><Text>守備</Text>{[1,2,3,4,5,6,7,8,9,10].map(pos=><TouchableOpacity key={pos} style={[s.chip,draft.lineups[teamId][i].position_id===pos&&s.active,{paddingHorizontal:8,paddingVertical:7}]} onPress={()=>setDraft((d:any)=>({...d,lineups:{...d.lineups,[teamId]:d.lineups[teamId].map((r:any,j:number)=>j===i?{...r,position_id:pos}:r)}}))}><Text style={draft.lineups[teamId][i].position_id===pos?s.activeText:s.chipText}>{pos===10?"DH":pos}</Text></TouchableOpacity>)}<ScrollView horizontal style={{maxWidth:280}}>{playersForCreate.filter(p=>p.team_id===teamId&&(retiredVisible||!p.retired)).map(p=><TouchableOpacity key={p.id} style={[s.chip,draft.lineups[teamId][i].roster_player_id===p.id&&s.active]} onPress={()=>setDraft((d:any)=>({...d,lineups:{...d.lineups,[teamId]:d.lineups[teamId].map((r:any,j:number)=>j===i?{...r,roster_player_id:p.id}:r)}}))}><Text style={draft.lineups[teamId][i].roster_player_id===p.id?s.activeText:s.chipText}>{p.name}</Text></TouchableOpacity>)}</ScrollView></View>)}</View>)}<TouchableOpacity style={s.chip} onPress={()=>setDraft((d:any)=>({...d,ohtani:!d.ohtani}))}><Text>大谷ルール {draft?.ohtani?"ON":"OFF"}</Text></TouchableOpacity></ScrollView><View style={s.row}><TouchableOpacity style={s.outline} onPress={()=>setCreateOpen(false)}><Text>キャンセル</Text></TouchableOpacity><TouchableOpacity style={s.primary} onPress={createGame}><Text style={s.primaryText}>試合を作成</Text></TouchableOpacity></View></View></View></Modal>
  </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#f4f6f8"},wrap:{padding:20,gap:12,maxWidth:1100,width:"100%",alignSelf:"center"},center:{flex:1,alignItems:"center",justifyContent:"center"},title:{fontSize:28,fontWeight:"700",color:"#132b45"},row:{flexDirection:"row",gap:8,flexWrap:"wrap"},chip:{paddingHorizontal:16,paddingVertical:10,borderWidth:1,borderColor:"#ccd5de",borderRadius:8,backgroundColor:"white"},active:{backgroundColor:"#0a7ea4",borderColor:"#0a7ea4"},chipText:{color:"#243b53"},activeText:{color:"white",fontWeight:"600"},primary:{backgroundColor:"#0a7ea4",borderRadius:8,padding:14,alignItems:"center"},primaryText:{color:"white",fontWeight:"700",fontSize:16},card:{backgroundColor:"white",borderRadius:10,padding:14,flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#e1e6eb"},cardTitle:{fontWeight:"700",fontSize:16,color:"#152f49"},sub:{fontSize:13,color:"#65788a",marginTop:4},outline:{borderColor:"#0a7ea4",borderWidth:1,borderRadius:7,paddingHorizontal:12,paddingVertical:9}});
