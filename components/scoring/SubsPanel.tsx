import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { Hand, Substitution } from "@/lib/scoring/engine";

// 選手交代（BASSと同じ流れ）
// 1. 両チームの打順表を並べて見せる。守備は各行で変えられる
// 2. 「変更」でチームごとの画面を開き、右の枠を押してから左の選手を押すと入れ替わり、次の枠へ自動で進む
// 3. 「保存」でまとめて反映する（入力画面の今のページに交代として残る）
type Lineup = { order: number[]; pos: number[]; bats: Hand[]; P: number; throws: Hand };
type Player = { id: string; team_id: string; name: string; uniform_no?: unknown; show_index?: unknown; primary_position_id?: unknown; throw_hand?: unknown; bat_hand?: unknown; retired?: unknown };
const POSN = ["", "投", "捕", "一", "二", "三", "遊", "左", "中", "右", "DH"];
const handJa = (h: unknown): Hand => (h === "L" ? "左" : h === "S" ? "両" : "右");
const numOf = (p: Player) => Number(p.uniform_no ?? p.show_index);
const groupOf = (p: Player) => { const n = Number(p.primary_position_id); return n === 1 ? "投手" : n === 2 ? "捕手" : [3, 4, 5, 6, 14].includes(n) ? "内野手" : [7, 8, 9, 15].includes(n) ? "外野手" : "その他"; };
const posLabel = (p: Player) => { const n = Number(p.primary_position_id); return n === 14 ? "内野手" : n === 15 ? "外野手" : POSN[n] ?? "他"; };

export function SubsPanel(props: {
  teamNames: [string, string];
  lineups: [Lineup, Lineup];
  players: [Player[], Player[]];
  nameOf: (t: 0 | 1, no: number) => string;
  /** 交代を順に当てて、出せない選手があれば理由を返す */
  validate: (subs: Substitution[]) => string | null;
  onRegister: (t: 0 | 1, p: { name: string; no: number; pos: number; throws: string; bats: string }) => Player;
  onCancel: () => void;
  onSave: (subs: Substitution[]) => void;
}) {
  const { teamNames, lineups, players, nameOf } = props;
  const copy = (l: Lineup): Lineup => ({ ...l, order: [...l.order], pos: [...l.pos], bats: [...l.bats] });
  const [draft, setDraft] = useState<[Lineup, Lineup]>(() => [copy(lineups[0]), copy(lineups[1])]);
  const [editing, setEditing] = useState<0 | 1 | null>(null);
  const [teamDraft, setTeamDraft] = useState<Lineup | null>(null);
  const [sel, setSel] = useState(0); // 0〜8＝打順、9＝投手
  const [filter, setFilter] = useState("すべて");
  const [search, setSearch] = useState("");
  const [retired, setRetired] = useState(false);
  const [posPick, setPosPick] = useState<{ t: 0 | 1; slot: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newP, setNewP] = useState({ name: "", no: "", pos: 1, throws: "R", bats: "R" });
  const [error, setError] = useState("");

  // 今の打順表から交代の一覧を作る（打順が変わった枠は選手の交代、守備だけ変わった枠は守備の変更）
  const toSubs = (d: [Lineup, Lineup]): Substitution[] => {
    const out: Substitution[] = [];
    for (const t of [0, 1] as const) {
      const a = lineups[t], b = d[t];
      for (let i = 0; i < 9; i++) {
        if (a.order[i] !== b.order[i]) out.push({ t, slot: i, no: b.order[i], bats: b.bats[i], pos: b.pos[i] });
        else if (a.pos[i] !== b.pos[i]) out.push({ t, slot: i, no: null, pos: b.pos[i] });
      }
      if (a.P !== b.P) out.push({ t, slot: "P", no: b.P, throws: b.throws, pos: 1 });
    }
    return out;
  };
  const subs = useMemo(() => toSubs(draft), [draft]);

  const nameIn = (t: 0 | 1, no: number) => players[t].find(p => numOf(p) === no)?.name ?? nameOf(t, no);
  const handsOf = (t: 0 | 1, no: number) => { const p = players[t].find(x => numOf(x) === no); return { T: p?.throw_hand ? handJa(p.throw_hand) : "—", B: p?.bat_hand ? handJa(p.bat_hand) : "—" }; };

  // 選手を枠に入れる。打順の中で投手（守備1）の枠と「投手」の行は同じ選手なので、どちらかを変えたら両方そろえる
  const place = (p: Player) => {
    if (!teamDraft || editing == null) return;
    const no = numOf(p); if (!no) { setError("この選手は背番号（番号）がありません。マスター管理で入れてください"); return; }
    const d = copy(teamDraft);
    if (sel === 9) {
      const oldP = d.P; d.P = no; d.throws = handJa(p.throw_hand);
      const i = d.order.findIndex((n, k) => n === oldP && d.pos[k] === 1); if (i >= 0) { d.order[i] = no; d.bats[i] = handJa(p.bat_hand); }
    } else {
      const old = d.order[sel]; d.order[sel] = no; d.bats[sel] = handJa(p.bat_hand);
      if (d.pos[sel] === 1 && d.P === old) { d.P = no; d.throws = handJa(p.throw_hand); }
    }
    setTeamDraft(d); setError(""); setSel(s => (s >= 9 ? 9 : s + 1));
  };
  const openTeam = (t: 0 | 1) => { setEditing(t); setTeamDraft(copy(draft[t])); setSel(0); setFilter("すべて"); setSearch(""); setAdding(false); setError(""); };
  const closeTeam = (keep: boolean) => { if (keep && teamDraft != null && editing != null) { const d: [Lineup, Lineup] = [draft[0], draft[1]]; d[editing] = teamDraft; setDraft(d); } setEditing(null); setTeamDraft(null); };
  const setPos = (t: 0 | 1, slot: number, pos: number) => {
    if (editing != null && teamDraft) { const d = copy(teamDraft); d.pos[slot] = pos; setTeamDraft(d); }
    else { const d: [Lineup, Lineup] = [copy(draft[0]), copy(draft[1])]; d[t].pos[slot] = pos; setDraft(d); }
    setPosPick(null);
  };
  const save = () => {
    if (!subs.length) { props.onCancel(); return; }
    for (const t of [0, 1] as const) {
      const ps = draft[t].pos.filter(x => x >= 1 && x <= 10); const dup = ps.find((x, i) => ps.indexOf(x) !== i && x !== 10);
      if (dup) { setError(`${teamNames[t]}：守備「${POSN[dup]}」が重なっています`); return; }
      const nos = draft[t].order; const d2 = nos.find((x, i) => nos.indexOf(x) !== i);
      if (d2 != null) { setError(`${teamNames[t]}：#${d2} が打順に2回入っています`); return; }
    }
    const why = props.validate(subs); if (why) { setError(why); return; }
    props.onSave(subs);
  };

  const row = (t: 0 | 1, l: Lineup, i: number, editable: boolean) => {
    const no = i === 9 ? l.P : l.order[i]; const h = handsOf(t, no); const changed = i === 9 ? lineups[t].P !== no : lineups[t].order[i] !== no || lineups[t].pos[i] !== l.pos[i];
    const active = editable && sel === i;
    return <TouchableOpacity key={i} disabled={!editable} onPress={() => setSel(i)} style={[st.row, active && st.rowActive, changed && !active && st.rowChanged]}>
      <Text allowFontScaling={false} style={[st.c, { width: 36 }]}>{i === 9 ? "" : i + 1}</Text>
      {i === 9 ? <Text allowFontScaling={false} style={[st.c, { width: 64 }]}>投手</Text>
        : <TouchableOpacity onPress={() => setPosPick({ t, slot: i })} style={st.posBtn}><Text allowFontScaling={false}>{POSN[l.pos[i]] ?? "-"} ⌄</Text></TouchableOpacity>}
      <Text allowFontScaling={false} style={[st.c, { width: 40, textAlign: "right" }]}>{no}</Text>
      <Text allowFontScaling={false} style={[st.c, { width: 30, textAlign: "center" }]}>{h.T}</Text>
      <Text allowFontScaling={false} style={[st.c, { width: 30, textAlign: "center" }]}>{i === 9 ? "" : h.B === "—" ? "—" : l.bats[i]}</Text>
      <Text allowFontScaling={false} numberOfLines={1} style={[st.c, { flex: 1 }]}>{nameIn(t, no)}</Text>
    </TouchableOpacity>;
  };
  const table = (t: 0 | 1, l: Lineup, editable: boolean) => <View style={st.table}>
    <View style={[st.row, st.head]}>{[["", 36], ["守備", 64], ["#", 40], ["T", 30], ["B", 30]].map(([h, w]) => <Text allowFontScaling={false} key={String(h) + w} style={[st.hc, { width: Number(w) }]}>{h}</Text>)}<Text allowFontScaling={false} style={[st.hc, { flex: 1 }]}>選手</Text></View>
    {Array.from({ length: 10 }, (_, i) => row(t, l, i, editable))}
  </View>;

  const list = editing == null ? [] : players[editing].filter(p => (retired || !p.retired) && (filter === "すべて" || groupOf(p) === filter) && (!search || `${p.name} ${numOf(p)}`.includes(search))).sort((a, b) => numOf(a) - numOf(b));
  const inGame = (p: Player) => teamDraft != null && (teamDraft.order.includes(numOf(p)) || teamDraft.P === numOf(p));

  return <View style={st.wrap}>
    {editing == null ? <>
      <Text allowFontScaling={false} style={st.title}>選手交代</Text>
      <View style={st.cols}>{([0, 1] as const).map(t => <View key={t} style={st.col}>
        <View style={st.teamHead}><Text allowFontScaling={false} style={st.teamName}>{teamNames[t]}</Text><TouchableOpacity style={st.change} onPress={() => openTeam(t)}><Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>変更</Text></TouchableOpacity></View>
        {table(t, draft[t], false)}
      </View>)}</View>
      {!!subs.length && <Text allowFontScaling={false} style={st.note}>保存すると {subs.length} 件の交代を、このページから反映します</Text>}
      {!!error && <Text allowFontScaling={false} style={st.error}>{error}</Text>}
      <View style={st.foot}><TouchableOpacity style={st.btn} onPress={props.onCancel}><Text allowFontScaling={false}>キャンセル</Text></TouchableOpacity><TouchableOpacity style={[st.btn, st.primary]} onPress={save}><Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>保存</Text></TouchableOpacity></View>
    </> : <>
      <Text allowFontScaling={false} style={st.title}>メンバーの変更：{teamNames[editing]}</Text>
      <Text allowFontScaling={false} style={st.note}>右の枠を押してから、左の選手を押すと入れ替わります（次の枠へ自動で進みます）</Text>
      <View style={st.cols}>
        <View style={st.col}>
          <View style={st.filters}>
            <TouchableOpacity style={st.add} onPress={() => setAdding(v => !v)}><Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>＋</Text></TouchableOpacity>
            {["すべて", "投手", "捕手", "内野手", "外野手", "その他"].map(f => <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[st.chip, filter === f && st.chipOn]}><Text allowFontScaling={false} style={filter === f ? { color: "#fff" } : undefined}>{f}</Text></TouchableOpacity>)}
            <TouchableOpacity onPress={() => setRetired(v => !v)}><Text allowFontScaling={false}>{retired ? "☑" : "□"} 引退選手</Text></TouchableOpacity>
          </View>
          {adding ? <View style={st.newBox}>
            <Text allowFontScaling={false} style={{ fontWeight: "700" }}>名簿にない選手を仮登録</Text>
            <TextInput allowFontScaling={false} style={st.input} value={newP.name} onChangeText={v => setNewP({ ...newP, name: v })} placeholder="名前" />
            <TextInput allowFontScaling={false} style={st.input} value={newP.no} onChangeText={v => setNewP({ ...newP, no: v.replace(/[^0-9]/g, "") })} placeholder="背番号" keyboardType="number-pad" />
            <View style={st.filters}>{[[1, "投"], [2, "捕"], [14, "内野手"], [15, "外野手"], [16, "その他"]].map(([v, l]) => <TouchableOpacity key={String(v)} onPress={() => setNewP({ ...newP, pos: Number(v) })} style={[st.chip, newP.pos === v && st.chipOn]}><Text allowFontScaling={false} style={newP.pos === v ? { color: "#fff" } : undefined}>{l}</Text></TouchableOpacity>)}</View>
            <View style={st.filters}><Text allowFontScaling={false}>投げ</Text>{[["R", "右"], ["L", "左"]].map(([v, l]) => <TouchableOpacity key={v} onPress={() => setNewP({ ...newP, throws: v })} style={[st.chip, newP.throws === v && st.chipOn]}><Text allowFontScaling={false} style={newP.throws === v ? { color: "#fff" } : undefined}>{l}</Text></TouchableOpacity>)}
              <Text allowFontScaling={false}>　打ち</Text>{[["R", "右"], ["L", "左"], ["S", "両"]].map(([v, l]) => <TouchableOpacity key={v} onPress={() => setNewP({ ...newP, bats: v })} style={[st.chip, newP.bats === v && st.chipOn]}><Text allowFontScaling={false} style={newP.bats === v ? { color: "#fff" } : undefined}>{l}</Text></TouchableOpacity>)}</View>
            <TouchableOpacity style={[st.btn, st.primary, { alignSelf: "flex-start" }]} onPress={() => {
              const no = Number(newP.no); if (!newP.name.trim() || !no) { setError("名前と背番号を入れてください"); return; }
              if (players[editing].some(p => numOf(p) === no)) { setError(`#${no} はすでにいます`); return; }
              const p = props.onRegister(editing, { name: newP.name.trim(), no, pos: newP.pos, throws: newP.throws, bats: newP.bats });
              setAdding(false); setNewP({ name: "", no: "", pos: 1, throws: "R", bats: "R" }); place(p);
            }}><Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>仮登録して入れる</Text></TouchableOpacity>
          </View> : <>
            <TextInput allowFontScaling={false} style={st.input} value={search} onChangeText={setSearch} placeholder="名前・番号で検索" />
            <View style={[st.row, st.head]}><Text allowFontScaling={false} style={[st.hc, { width: 64 }]}>守備</Text><Text allowFontScaling={false} style={[st.hc, { width: 40 }]}>#</Text><Text allowFontScaling={false} style={[st.hc, { width: 30 }]}>T</Text><Text allowFontScaling={false} style={[st.hc, { width: 30 }]}>B</Text><Text allowFontScaling={false} style={[st.hc, { flex: 1 }]}>選手</Text></View>
            <ScrollView style={{ maxHeight: 430 }}>{list.map(p => <TouchableOpacity key={p.id} onPress={() => place(p)} style={[st.row, inGame(p) && st.rowIn]}>
              <Text allowFontScaling={false} style={[st.c, { width: 64 }]}>{posLabel(p)}</Text><Text allowFontScaling={false} style={[st.c, { width: 40, textAlign: "right" }]}>{numOf(p) || ""}</Text>
              <Text allowFontScaling={false} style={[st.c, { width: 30, textAlign: "center" }]}>{p.throw_hand ? handJa(p.throw_hand) : "—"}</Text><Text allowFontScaling={false} style={[st.c, { width: 30, textAlign: "center" }]}>{p.bat_hand ? handJa(p.bat_hand) : "—"}</Text>
              <Text allowFontScaling={false} numberOfLines={1} style={[st.c, { flex: 1 }]}>{p.name}{inGame(p) ? "（出場中）" : ""}</Text>
            </TouchableOpacity>)}</ScrollView>
          </>}
        </View>
        <View style={st.col}>{teamDraft && table(editing, teamDraft, true)}</View>
      </View>
      {!!error && <Text allowFontScaling={false} style={st.error}>{error}</Text>}
      <View style={st.foot}><TouchableOpacity style={st.btn} onPress={() => closeTeam(false)}><Text allowFontScaling={false}>閉じる</Text></TouchableOpacity><TouchableOpacity style={[st.btn, st.primary]} onPress={() => closeTeam(true)}><Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>確定</Text></TouchableOpacity></View>
    </>}
    {posPick && <View style={st.posOverlay}><View style={st.posBox}>
      <Text allowFontScaling={false} style={{ fontWeight: "700", marginBottom: 8 }}>{posPick.slot + 1}番の守備</Text>
      <View style={st.filters}>{POSN.slice(1).map((n, k) => <TouchableOpacity key={n} onPress={() => setPos(posPick.t, posPick.slot, k + 1)} style={[st.chip, { minWidth: 48, alignItems: "center" }]}><Text allowFontScaling={false}>{n}</Text></TouchableOpacity>)}</View>
      <TouchableOpacity style={[st.btn, { marginTop: 8, alignSelf: "flex-start" }]} onPress={() => setPosPick(null)}><Text allowFontScaling={false}>閉じる</Text></TouchableOpacity>
    </View></View>}
  </View>;
}

const st = StyleSheet.create({
  wrap: { gap: 10, width: "100%" },
  title: { fontSize: 22, fontWeight: "700" },
  cols: { flexDirection: "row", gap: 16 },
  col: { flex: 1, gap: 8 },
  teamHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teamName: { fontSize: 17, fontWeight: "700" },
  change: { backgroundColor: "#20c997", paddingHorizontal: 18, paddingVertical: 8, borderRadius: 6 },
  table: { borderWidth: 1, borderColor: "#dee2e6" },
  row: { flexDirection: "row", alignItems: "center", minHeight: 40, borderBottomWidth: 1, borderColor: "#f1f3f5", paddingHorizontal: 6, gap: 4 },
  head: { backgroundColor: "#f8f9fa", minHeight: 32 },
  hc: { fontWeight: "700", color: "#495057" },
  c: { fontSize: 15 },
  rowActive: { backgroundColor: "#63e6be" },
  rowChanged: { backgroundColor: "#fff9db" },
  rowIn: { backgroundColor: "#e9ecef" },
  posBtn: { width: 64, borderWidth: 1, borderColor: "#ced4da", borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "#ced4da", borderRadius: 6, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  add: { backgroundColor: "#20c997", width: 38, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderColor: "#ced4da", borderRadius: 6, padding: 8, fontSize: 15, backgroundColor: "#fff" },
  newBox: { gap: 8, padding: 10, borderWidth: 1, borderColor: "#dee2e6", borderRadius: 8 },
  note: { color: "#495057" },
  error: { color: "#e03131", fontWeight: "700" },
  foot: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: "#ced4da", borderRadius: 8, backgroundColor: "#fff" },
  primary: { backgroundColor: "#20c997", borderColor: "#20c997" },
  posOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,.25)", justifyContent: "center", alignItems: "center" },
  posBox: { backgroundColor: "#fff", padding: 16, borderRadius: 10, width: 420 },
});
