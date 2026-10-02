import { useCallback, useMemo, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/scoring/net";

const tabs = ["チーム", "選手", "球場", "カテゴリ", "球種", "結果", "作戦", "メモ"] as const;
type Kind = (typeof tabs)[number];
const tables: Record<Kind, string> = { チーム: "opponent_teams", 選手: "scoring_roster_players", 球場: "scoring_stadiums", カテゴリ: "scoring_categories", 球種: "scoring_ball_types", 結果: "scoring_results", 作戦: "scoring_plans", メモ: "scoring_memos" };
const columns: Record<Kind, [string, string][]> = {
  チーム: [["name", "名前"], ["name_s", "略称"], ["category_id", "カテゴリ"], ["display_order", "表示順"]],
  選手: [["team_id", "チーム"], ["uniform_no", "背番号"], ["name", "名前"], ["throw_hand", "投"], ["bat_hand", "打"], ["primary_position_id", "守備"], ["retired", "引退"]],
  球場: [["name", "名前"], ["name_s", "略称"], ["name_e", "英語名"], ["left_distance", "左翼"], ["center_distance", "中堅"], ["right_distance", "右翼"]],
  カテゴリ: [["name", "名前"], ["name_s", "略称"], ["name_e", "英語名"], ["kind", "種別"], ["show_index", "表示順"]],
  球種: [["name", "名前"], ["name_s", "略称"], ["symbol", "記号"], ["family_id", "系統"], ["stats_kind", "集計種別"], ["display_flag", "表示"]],
  結果: [["name", "名前"], ["name_s", "略称"], ["division", "区分"], ["strike_flag", "S"], ["ball_flag", "B"], ["out_flag", "O"], ["runs", "進塁"], ["last_ball", "打席終了"], ["batting_flag", "打撃"], ["pitcher_flag", "投手成績"], ["display_flag", "表示"]],
  作戦: [["name", "名前"], ["name_s", "略称"], ["division", "区分"], ["bunt_flag", "バント"], ["and_run_flag", "エンドラン"], ["steal_flag", "盗塁"], ["sb_flag", "盗塁成功"], ["cs_flag", "盗塁失敗"], ["display_flag", "表示"]],
  メモ: [["name", "名前"], ["division", "区分"], ["show_index", "表示順"]],
};
const str = (value: unknown) => value == null ? "" : String(value);

export default function ScoringMasters() {
  const { user, isLoading, hasRole } = useAuth();
  const [kind, setKind] = useState<Kind>("チーム");
  const [rows, setRows] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [stadiums, setStadiums] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [careers, setCareers] = useState<any[]>([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [search, setSearch] = useState("");
  const [includeRetired, setIncludeRetired] = useState(false);
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  // マスターはサーバーが正。電波がないときに編集すると端末どうしで食い違うので、つながっているときだけ編集できるようにする
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: teamData }, {data: categoryData}, {data: stadiumData}, {data: positionData}, {data: careerData}] = await Promise.all([
      withTimeout(supabase.from(tables[kind]).select("*").limit(1000)) as any,
      withTimeout(supabase.from("opponent_teams").select("id,name").order("name")) as any,
      withTimeout(supabase.from("scoring_categories").select("id,name")) as any,
      withTimeout(supabase.from("scoring_stadiums").select("id,name")) as any,
      withTimeout(supabase.from("scoring_positions").select("id,name")) as any,
      withTimeout(supabase.from("scoring_player_careers").select("roster_player_id,team_id,uniform_no,start_date,end_date").is("end_date", null)) as any,
    ]);
    setOffline(!data);
    setRows(data ?? []);
    setTeams(teamData ?? []);
    setCategories(categoryData ?? []); setStadiums(stadiumData ?? []); setPositions(positionData ?? []); setCareers(careerData ?? []);
    setLoading(false);
  }, [kind]);
  useFocusEffect(useCallback(() => { refresh(); return undefined; }, [refresh]));

  const displayRows = useMemo(() => rows.filter(row => {
    if (!includeDisabled && row.display_flag === false) return false;
    if (kind === "選手" && !includeRetired && row.retired === true) return false;
    if (kind === "選手" && teamFilter && str(row.team_id) !== teamFilter) return false;
    if (search.trim() && ![row.name, row.name_s, row.name_e, row.name_es].some(v => str(v).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))) return false;
    return true;
  }), [rows, kind, includeDisabled, includeRetired, teamFilter, search]);
  const valueFor = (row: any, field: string) => {
    let value = row[field];
    if (field === "uniform_no") value = careers.find(c => c.roster_player_id === row.id && c.team_id === row.team_id)?.uniform_no ?? value;
    if (["team_id", "category_id", "stadium_id", "primary_position_id", "family_id"].includes(field)) {
      const options = field === "team_id" ? teams : field === "category_id" ? categories : field === "stadium_id" ? stadiums : field === "primary_position_id" ? positions : rows;
      value = options.find(item => str(item.id) === str(value))?.name ?? value;
    }
    if (["display_flag", "retired", "is_own_team", "strike_flag", "ball_flag", "out_flag", "last_ball", "batting_flag", "pitcher_flag", "bunt_flag", "and_run_flag", "steal_flag", "sb_flag", "cs_flag"].includes(field)) return value === true ? "○" : value === false ? "—" : str(value);
    if (["throw_hand", "bat_hand"].includes(field)) return ({R:"右",L:"左",S:"両"} as Record<string,string>)[str(value)] ?? str(value);
    if (field === "primary_position_id") return ({"1":"投","2":"捕","3":"一","4":"二","5":"三","6":"遊","7":"左","8":"中","9":"右","10":"DH"} as Record<string,string>)[str(row[field])] ?? str(value);
    return str(value);
  };
  const openForm = (id?: string) => offline ? Alert.alert("ネットにつながっていません", "マスターの追加・編集は、ネットにつながっているときにしてください") : router.push((`/scoring/master?kind=${encodeURIComponent(kind)}${id ? `&id=${encodeURIComponent(id)}` : ""}`) as any);

  if (isLoading) return <View style={s.center}><Text>読み込み中…</Text></View>;
  if (!user) return <Redirect href="/login" />;
  if (!hasRole("analyst") && !hasRole("admin")) return <Redirect href="/(tabs)" />;

  return <ScrollView style={s.page} contentContainerStyle={s.wrap}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{tabs.map(tab => <TouchableOpacity key={tab} onPress={() => { setKind(tab); setSearch(""); setTeamFilter(""); }} style={[s.tab, kind === tab && s.active]}><Text style={kind === tab ? s.activeText : s.tabText}>{tab}</Text></TouchableOpacity>)}</ScrollView>
    {offline && <View style={s.offline}><Text style={s.offlineText}>ネットにつながっていないため、マスターを読み込めません。追加・編集は、ネットにつながっているときにしてください。</Text></View>}
    <View style={s.toolbar}>
      <TouchableOpacity style={s.add} onPress={() => openForm()}><Text style={s.addText}>＋ 追加</Text></TouchableOpacity>
      <View style={s.toggle}><Text>無効を含める</Text><Switch value={includeDisabled} onValueChange={setIncludeDisabled} /></View>
    </View>
    {kind === "選手" && <View style={s.filters}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}><TouchableOpacity style={[s.tab, !teamFilter && s.active]} onPress={() => setTeamFilter("")}><Text style={!teamFilter ? s.activeText : s.tabText}>全チーム</Text></TouchableOpacity>{teams.map(team => <TouchableOpacity key={team.id} style={[s.tab, teamFilter === str(team.id) && s.active]} onPress={() => setTeamFilter(str(team.id))}><Text style={teamFilter === str(team.id) ? s.activeText : s.tabText}>{team.name}</Text></TouchableOpacity>)}</ScrollView>
      <View style={s.toggle}><Text>引退選手を含める</Text><Switch value={includeRetired} onValueChange={setIncludeRetired} /></View>
      <TextInput style={s.search} value={search} onChangeText={setSearch} placeholder="選手名・略称で検索" />
    </View>}
    {kind !== "選手" && <TextInput style={s.search} value={search} onChangeText={setSearch} placeholder={`${kind}名で検索`} />}
    <Text style={s.count}>{loading ? "読み込み中…" : `${displayRows.length}件`}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: "100%" }}><View>
      <View style={[s.tableRow, s.headRow]}><Text style={[s.cell, s.editCell]}>操作</Text>{columns[kind].map(([field, label]) => <Text key={field} style={s.cell}>{label}</Text>)}</View>
      {displayRows.map((row, index) => {
        const disabled = row.display_flag === false || (kind === "選手" && row.retired === true);
        return <View key={str(row.id) || index} style={[s.tableRow, index % 2 === 1 && s.altRow, disabled && s.disabledRow]}>
          <TouchableOpacity style={[s.cell, s.editCell]} onPress={() => openForm(str(row.id))}><Text style={s.editText}>編集</Text></TouchableOpacity>
          {columns[kind].map(([field]) => <Text key={field} style={s.cell} numberOfLines={1}>{valueFor(row, field)}</Text>)}
        </View>;
      })}
    </View></ScrollView>
    {!loading && displayRows.length === 0 && <Text style={s.empty}>該当するデータはありません。</Text>}
  </ScrollView>;
}

const s = StyleSheet.create({
  offline: { padding: 12, borderRadius: 8, backgroundColor: "#fff4e6", borderWidth: 1, borderColor: "#ffa94d" },
  offlineText: { color: "#d9480f", fontWeight: "600" }, page: { flex: 1, backgroundColor: "#f4f6f8" }, wrap: { padding: 16, gap: 12, maxWidth: 1200, width: "100%", alignSelf: "center" }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, tabs: { flexDirection: "row", gap: 7, alignItems: "center" }, tab: { paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: "#ccd5de", borderRadius: 8, backgroundColor: "white" }, active: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" }, tabText: { color: "#243b53" }, activeText: { color: "white", fontWeight: "700" }, toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, add: { backgroundColor: "#0a7ea4", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8 }, addText: { color: "white", fontWeight: "700" }, toggle: { flexDirection: "row", alignItems: "center", gap: 8 }, filters: { gap: 10 }, search: { backgroundColor: "white", borderWidth: 1, borderColor: "#ccd5de", borderRadius: 8, padding: 11 }, count: { color: "#65788a" }, tableRow: { flexDirection: "row", minHeight: 46, alignItems: "center", backgroundColor: "white", borderBottomWidth: 1, borderColor: "#e1e6eb" }, headRow: { backgroundColor: "#e9eef2" }, altRow: { backgroundColor: "#fbfcfd" }, disabledRow: { backgroundColor: "#e3e5e7", opacity: 0.62 }, cell: { width: 120, paddingHorizontal: 10, paddingVertical: 12, color: "#243b53" }, editCell: { width: 76 }, editText: { color: "#0a7ea4", fontWeight: "700" }, empty: { textAlign: "center", color: "#65788a", padding: 20 } });
