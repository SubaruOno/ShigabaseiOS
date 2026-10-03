import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { DebugIssue } from "@/lib/scoring/debug-check";
import { inningsText, type GameSummary } from "@/lib/scoring/game-summary";

// 試合編集（BASSの「入力終了」のあとの画面）
// スコアボード・投手成績・打者ごとの打席の一覧。打席を押すと、その打席の入力ページへ戻る。
// デバックチェック（分析シートのデバツクチェッカーと同じ確認）の結果も出し、押すとそのページへ戻る。
export function GameEditPanel(props: {
  teamNames: [string, string];
  summary: GameSummary;
  nameOf: (team: 0 | 1, no: number) => string;
  issues: DebugIssue[] | null;
  onCheck: () => void;
  onJumpPage: (page: number) => void;
  onJumpRow: (row: number) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { teamNames, summary, nameOf, issues } = props;
  const st = summary.final;
  const innings = Math.max(9, st.line[0].length, st.line[1].length);
  const t = (s: string | number, style?: object) => <Text allowFontScaling={false} style={[css.cell, style]}>{s}</Text>;
  return <View style={css.wrap}>
    <View style={css.head}>
      <Text allowFontScaling={false} style={css.title}>試合編集</Text>
      <View style={css.row}>
        <TouchableOpacity style={css.btn} onPress={props.onBack}><Text allowFontScaling={false}>入力に戻る</Text></TouchableOpacity>
        <TouchableOpacity style={[css.btn, css.check]} onPress={props.onCheck}><Text allowFontScaling={false} style={css.white}>デバックチェック</Text></TouchableOpacity>
        <TouchableOpacity style={[css.btn, css.save]} onPress={props.onFinish}><Text allowFontScaling={false} style={css.white}>保存して終了</Text></TouchableOpacity>
      </View>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
      {issues && <View style={css.box}>
        <Text allowFontScaling={false} style={css.sub}>デバックチェック：{issues.length ? `${issues.length}件` : "ミスは見つかりませんでした"}</Text>
        {issues.some(x => x.fatal) && <Text allowFontScaling={false} style={css.warn}>継続・完了の印が崩れている行があります。先にこれを直してください（ほかの確認はしていません）</Text>}
        {issues.map((x, i) => <TouchableOpacity key={i} disabled={x.row < 0} onPress={() => props.onJumpRow(x.row)} style={css.issue}>
          <Text allowFontScaling={false} style={{ width: 70, color: "#1971c2" }}>{x.row >= 0 ? `${x.row + 1}行目` : "全体"}</Text>
          <Text allowFontScaling={false} style={{ width: 200, fontWeight: "700" }}>{x.label}</Text>
          <Text allowFontScaling={false} style={{ flex: 1, color: "#495057" }}>{x.col}列：{x.value === "" ? "（空欄）" : x.value}</Text>
        </TouchableOpacity>)}
      </View>}
      <View style={css.box}>
        <View style={css.tr}>{t("", { width: 140 })}{Array.from({ length: innings }, (_, i) => t(i + 1))}{t("計", css.bold)}{t("安")}{t("失")}</View>
        {([0, 1] as const).map(team => <View key={team} style={css.tr}>{t(teamNames[team], { width: 140, textAlign: "left" })}{Array.from({ length: innings }, (_, i) => t(st.line[team][i] ?? ""))}{t(st.score[team], css.bold)}{t(st.hits[team])}{t(st.err[team])}</View>)}
      </View>
      {([0, 1] as const).map(team => {
        const ps = summary.pitchers.filter(p => p.team === team);
        return <View key={`p${team}`} style={css.box}>
          <Text allowFontScaling={false} style={css.sub}>{teamNames[team]}の投手</Text>
          <View style={css.tr}>{t("投手", { width: 160, textAlign: "left" })}{["投球回", "打者", "球数", "安打", "本塁打", "三振", "四球", "死球", "失点"].map(h => t(h, { width: 56 }))}</View>
          {ps.map(p => <View key={p.no} style={css.tr}>{t(`#${p.no} ${nameOf(team, p.no)}`, { width: 160, textAlign: "left" })}{[inningsText(p.outs), p.batters, p.pitches, p.hits, p.hr, p.k, p.bb, p.hbp, p.runs].map((v, i) => t(v, { width: 56 }))}</View>)}
        </View>;
      })}
      {([0, 1] as const).map(team => {
        const pas = summary.pas.filter(x => x.team === team);
        const lastInning = Math.max(innings, ...pas.map(x => x.inning));
        return <View key={`b${team}`} style={css.box}>
          <Text allowFontScaling={false} style={css.sub}>{teamNames[team]}の打席（押すとその打席の入力に戻ります）</Text>
          <ScrollView horizontal>
            <View>
              <View style={css.tr}>{t("打順", { width: 150, textAlign: "left" })}{Array.from({ length: lastInning }, (_, i) => t(`${i + 1}回`, { width: 96 }))}</View>
              {Array.from({ length: 9 }, (_, slot) => {
                const mine = pas.filter(x => x.slot === slot);
                const names = [...new Set(mine.map(x => `#${x.batter} ${nameOf(team, x.batter)}`))];
                return <View key={slot} style={[css.tr, { alignItems: "flex-start" }]}>
                  <Text allowFontScaling={false} style={[css.cell, { width: 150, textAlign: "left" }]}>{slot + 1}. {names.join(" → ") || "—"}</Text>
                  {Array.from({ length: lastInning }, (_, i) => <View key={i} style={{ width: 96, gap: 3, paddingVertical: 3 }}>
                    {mine.filter(x => x.inning === i + 1).map(x => <TouchableOpacity key={x.page} onPress={() => props.onJumpPage(x.page)} style={css.pa}><Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 13, color: "#1c3d5a" }}>{x.text}</Text></TouchableOpacity>)}
                  </View>)}
                </View>;
              })}
            </View>
          </ScrollView>
        </View>;
      })}
    </ScrollView>
  </View>;
}

const css = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#ced4da", backgroundColor: "#fff" },
  check: { backgroundColor: "#1971c2", borderColor: "#1971c2" },
  save: { backgroundColor: "#20c997", borderColor: "#20c997" },
  white: { color: "#fff", fontWeight: "700" },
  box: { borderWidth: 1, borderColor: "#dee2e6", borderRadius: 8, padding: 10, gap: 4, backgroundColor: "#fff" },
  sub: { fontWeight: "700", fontSize: 15, marginBottom: 4 },
  tr: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#f1f3f5", minHeight: 30 },
  cell: { width: 34, textAlign: "center", fontSize: 14 },
  bold: { fontWeight: "700" },
  pa: { borderWidth: 1, borderColor: "#a5d8ff", backgroundColor: "#e7f5ff", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 },
  issue: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#f1f3f5" },
  warn: { color: "#e03131", fontWeight: "700" },
});
