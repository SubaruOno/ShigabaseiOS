import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

// ─── Types ───────────────────────────────────────────────────────────────────

type Session = {
  id: string;
  player_id: string;
  recorded_at: string;
  bench_weight: number | null;
  bench_reps: number | null;
  bench_1rm: number | null;
  deadlift_weight: number | null;
  deadlift_reps: number | null;
  deadlift_1rm: number | null;
  squat_weight: number | null;
  squat_reps: number | null;
  squat_1rm: number | null;
  body_weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  other_exercises: string | null;
};

type Player = { id: string; name: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const value = `${y}-${String(m).padStart(2, "0")}`;
    options.push({ value, label: `${y}年${m}月` });
  }
  return options;
}

function monthRangeStart(ym: string) {
  return `${ym}-01`;
}

function monthRangeEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${nextY}-${String(nextM).padStart(2, "0")}-01`;
}

function fmtCell(w: number | null, r: number | null) {
  if (w == null && r == null) return "-";
  if (w == null) return `-×${r}回`;
  if (r == null) return `${w}kg`;
  return `${w}kg×${r}回`;
}

function fmtRM(rm: number | null) {
  return rm != null ? `${rm}kg` : "-";
}

function fmtMonth(yyyymm: string) {
  const m = parseInt(yyyymm.slice(5, 7));
  const y = yyyymm.slice(0, 4);
  return `${y}年${m}月`;
}

// ─── Excel生成 ───────────────────────────────────────────────────────────────

const EXCEL_HEADER = [
  "日付", "ベンチ(kg)", "ベンチ(回)", "ベンチ1RM",
  "デッドリフト(kg)", "デッドリフト(回)", "デッドリフト1RM",
  "スクワット(kg)", "スクワット(回)", "スクワット1RM",
  "体重(kg)", "体脂肪率(%)", "除脂肪体重(kg)", "その他",
];

function sessionToRow(s: Session) {
  return [
    s.recorded_at.slice(0, 7),
    s.bench_weight ?? null,
    s.bench_reps ?? null,
    s.bench_1rm ?? null,
    s.deadlift_weight ?? null,
    s.deadlift_reps ?? null,
    s.deadlift_1rm ?? null,
    s.squat_weight ?? null,
    s.squat_reps ?? null,
    s.squat_1rm ?? null,
    s.body_weight_kg ?? null,
    s.body_fat_pct ?? null,
    s.lean_mass_kg ?? null,
    s.other_exercises ?? "",
  ];
}

function generateXLSX(sessions: Session[], players: Player[]): string {
  const playerMap = new Map(players.map((p) => [p.id, p.name]));
  const wb = XLSX.utils.book_new();

  // シート1: 全データ（選手名列あり）
  const allHeader = ["日付", "選手名", ...EXCEL_HEADER.slice(1)];
  const allRows = [...sessions]
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map((s) => [
      s.recorded_at.slice(0, 7),
      playerMap.get(s.player_id) ?? "不明",
      ...sessionToRow(s).slice(1),
    ]);
  const wsAll = XLSX.utils.aoa_to_sheet([allHeader, ...allRows]);
  applySheetStyle(wsAll, allHeader.length);
  XLSX.utils.book_append_sheet(wb, wsAll, "全データ");

  // 選手ごとのシート
  const playerSessions = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!playerSessions.has(s.player_id)) playerSessions.set(s.player_id, []);
    playerSessions.get(s.player_id)!.push(s);
  }

  for (const p of players) {
    const ss = playerSessions.get(p.id);
    if (!ss) continue;
    const sorted = [...ss].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const rows = sorted.map(sessionToRow);
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADER, ...rows]);
    applySheetStyle(ws, EXCEL_HEADER.length);
    // シート名は最大31文字・特殊文字不可
    const sheetName = p.name.slice(0, 31).replace(/[\\/:*?[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function applySheetStyle(ws: XLSX.WorkSheet, colCount: number) {
  // 列幅を設定
  ws["!cols"] = Array.from({ length: colCount }, (_, i) =>
    ({ wch: i === 0 ? 10 : i === 1 || i === 4 || i === 7 ? 12 : 8 })
  );
}

// ─── SVGグラフ生成 ───────────────────────────────────────────────────────────

function generateSVGChart(sessions: Session[]): string {
  const valid = sessions.filter(
    (s) => s.bench_weight != null || s.deadlift_weight != null || s.squat_weight != null
  );
  if (valid.length < 2) return "<p style='color:#999;font-size:11px'>データが2件以上必要です</p>";

  const W = 480, H = 160;
  const pad = { left: 42, right: 16, top: 14, bottom: 28 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const allVals = valid.flatMap((s) =>
    [s.bench_weight, s.deadlift_weight, s.squat_weight].filter((v): v is number => v != null)
  );
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const minVal = Math.max(0, rawMin - Math.ceil((rawMax - rawMin) * 0.15));
  const maxVal = rawMax + Math.ceil((rawMax - rawMin) * 0.15) + 1;
  const range = maxVal - minVal || 1;

  const xPos = (i: number) =>
    pad.left + (valid.length === 1 ? plotW / 2 : (i / (valid.length - 1)) * plotW);
  const yPos = (v: number) =>
    pad.top + plotH - ((v - minVal) / range) * plotH;

  const makeLine = (
    key: "bench_weight" | "deadlift_weight" | "squat_weight",
    color: string
  ) => {
    const pts = valid
      .map((s, i) => (s[key] != null ? `${xPos(i).toFixed(1)},${yPos(s[key]!).toFixed(1)}` : null))
      .filter(Boolean) as string[];
    if (pts.length < 2) return "";
    const dots = valid
      .map((s, i) =>
        s[key] != null
          ? `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(s[key]!).toFixed(1)}" r="3.5" fill="${color}"/>`
          : ""
      )
      .join("");
    return `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  };

  const steps = 4;
  const gridLines = Array.from({ length: steps + 1 }, (_, i) => {
    const v = minVal + (range / steps) * i;
    const y = yPos(v).toFixed(1);
    return `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="${pad.left - 4}" y="${(parseFloat(y) + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#999">${Math.round(v)}</text>`;
  }).join("");

  const xLabels = valid
    .map(
      (s, i) =>
        `<text x="${xPos(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#999">${parseInt(s.recorded_at.slice(5, 7))}月</text>`
    )
    .join("");

  const legend = [
    { label: "ベンチ", color: "#0a7ea4" },
    { label: "デッド", color: "#ef4444" },
    { label: "スクワット", color: "#22c55e" },
  ]
    .map(
      (l, i) =>
        `<circle cx="${pad.left + i * 90 + 6}" cy="${pad.top - 4}" r="4" fill="${l.color}"/>` +
        `<text x="${pad.left + i * 90 + 14}" y="${pad.top - 1}" font-size="9" fill="#666">${l.label}</text>`
    )
    .join("");

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#ddd" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${W - pad.right}" y2="${pad.top + plotH}" stroke="#ddd" stroke-width="1"/>
    ${makeLine("bench_weight", "#0a7ea4")}
    ${makeLine("deadlift_weight", "#ef4444")}
    ${makeLine("squat_weight", "#22c55e")}
    ${xLabels}
    ${legend}
  </svg>`;
}

// ─── 先月比較テーブル生成 ──────────────────────────────────────────────────────

function generateComparisonTable(sessions: Session[]): string {
  if (sessions.length < 2) return "";
  const sorted = [...sessions].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const delta = (cur: number | null, pre: number | null, unit: string) => {
    if (cur == null) return "-";
    if (pre == null) return `${cur}${unit}`;
    const d = cur - pre;
    const sign = d > 0 ? "+" : "";
    const color = d > 0 ? "#22c55e" : d < 0 ? "#ef4444" : "#666";
    const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "→";
    return `${cur}${unit} <span style="color:${color};font-size:10px">${sign}${d.toFixed(1)} ${arrow}</span>`;
  };

  const rows = [
    { label: "ベンチプレス", cur: latest.bench_weight, pre: prev.bench_weight, unit: "kg" },
    { label: "デッドリフト", cur: latest.deadlift_weight, pre: prev.deadlift_weight, unit: "kg" },
    { label: "スクワット", cur: latest.squat_weight, pre: prev.squat_weight, unit: "kg" },
    { label: "体重", cur: latest.body_weight_kg, pre: prev.body_weight_kg, unit: "kg" },
    { label: "体脂肪率", cur: latest.body_fat_pct, pre: prev.body_fat_pct, unit: "%" },
    { label: "除脂肪体重", cur: latest.lean_mass_kg, pre: prev.lean_mass_kg, unit: "kg" },
  ]
    .filter((r) => r.cur != null || r.pre != null)
    .map(
      (r) => `<tr>
        <td>${r.label}</td>
        <td>${r.pre != null ? `${r.pre}${r.unit}` : "-"}</td>
        <td>${r.cur != null ? `${r.cur}${r.unit}` : "-"}</td>
        <td>${delta(r.cur, r.pre, r.unit)}</td>
      </tr>`
    )
    .join("");

  return `
    <table class="compare-table">
      <thead><tr>
        <th>種目</th>
        <th>${fmtMonth(prev.recorded_at.slice(0, 7))}（前回）</th>
        <th>${fmtMonth(latest.recorded_at.slice(0, 7))}（最新）</th>
        <th>変化</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── PDF HTML生成 ─────────────────────────────────────────────────────────────

function generatePDFHTML(
  sessions: Session[],
  players: Player[],
  fromLabel: string,
  toLabel: string,
) {
  const playerMap = new Map(players.map((p) => [p.id, p.name]));

  // 選手ごとにセッションをグループ化
  const playerSessions = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!playerSessions.has(s.player_id)) playerSessions.set(s.player_id, []);
    playerSessions.get(s.player_id)!.push(s);
  }

  // 各選手のセクション
  const playerSections = players
    .filter((p) => playerSessions.has(p.id))
    .map((p) => {
      const ss = playerSessions.get(p.id)!.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      const maxBench = Math.max(...ss.map((s) => s.bench_weight ?? 0));
      const maxDead = Math.max(...ss.map((s) => s.deadlift_weight ?? 0));
      const maxSquat = Math.max(...ss.map((s) => s.squat_weight ?? 0));

      const rows = ss.map((s) => `
        <tr>
          <td>${fmtMonth(s.recorded_at.slice(0, 7))}</td>
          <td>${fmtCell(s.bench_weight, s.bench_reps)}</td>
          <td class="rm">${fmtRM(s.bench_1rm)}</td>
          <td>${fmtCell(s.deadlift_weight, s.deadlift_reps)}</td>
          <td class="rm">${fmtRM(s.deadlift_1rm)}</td>
          <td>${fmtCell(s.squat_weight, s.squat_reps)}</td>
          <td class="rm">${fmtRM(s.squat_1rm)}</td>
          <td>${s.body_weight_kg != null ? `${s.body_weight_kg}kg` : "-"}</td>
          <td>${s.body_fat_pct != null ? `${s.body_fat_pct}%` : "-"}</td>
        </tr>`).join("");

      // 成長バーチャート（CSS）
      const chartMax = Math.max(maxBench, maxDead, maxSquat, 1);
      const chartBars = (label: string, val: number, color: string) =>
        val > 0 ? `<div class="bar-row">
          <span class="bar-label">${label}</span>
          <div class="bar-bg"><div class="bar-fill" style="width:${Math.round(val/chartMax*100)}%;background:${color}"></div></div>
          <span class="bar-val">${val}kg</span>
        </div>` : "";

      return `
        <div class="player-section">
          <h2>${p.name}</h2>
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th>ベンチ</th><th class="rm">1RM</th>
                <th>デッドリフト</th><th class="rm">1RM</th>
                <th>スクワット</th><th class="rm">1RM</th>
                <th>体重</th><th>体脂肪</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="section-title">成長グラフ</div>
          <div class="svg-wrap">${generateSVGChart(ss)}</div>
          ${ss.length >= 2 ? `<div class="section-title">前回比較</div>${generateComparisonTable(ss)}` : ""}
          <div class="chart">
            <div class="chart-title">最大記録</div>
            ${chartBars("ベンチ", maxBench, "#0a7ea4")}
            ${chartBars("デッド", maxDead, "#ef4444")}
            ${chartBars("スクワット", maxSquat, "#22c55e")}
          </div>
        </div>`;
    }).join('<div class="page-break"></div>');

  // ランキングセクション
  const latestMap = new Map<string, Session>();
  for (const s of sessions) {
    const ex = latestMap.get(s.player_id);
    if (!ex || s.recorded_at > ex.recorded_at) latestMap.set(s.player_id, s);
  }

  const rankSection = (
    label: string,
    key: "bench_weight" | "deadlift_weight" | "squat_weight",
    color: string,
  ) => {
    const ranked = Array.from(latestMap.values())
      .filter((s) => s[key] != null)
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
    const rows = ranked.map((s, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td>${playerMap.get(s.player_id) ?? "不明"}</td>
        <td style="color:${color};font-weight:bold">${s[key]}kg</td>
        <td class="date">${fmtMonth(s.recorded_at.slice(0, 7))}</td>
      </tr>`).join("");
    return `
      <div class="rank-section">
        <h3 style="color:${color}">${label}</h3>
        <table class="rank-table"><thead>
          <tr><th>順位</th><th>選手名</th><th>重量</th><th>記録月</th></tr>
        </thead><tbody>${rows}</tbody></table>
      </div>`;
  };

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 24px; color: #1a1a1a; font-size: 12px; }
  h1 { font-size: 20px; color: #0a7ea4; margin-bottom: 4px; }
  h2 { font-size: 15px; color: #0a7ea4; border-bottom: 2px solid #0a7ea4; padding-bottom: 4px; margin-top: 20px; }
  h3 { font-size: 13px; margin-bottom: 6px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
  th { background: #f3f4f6; padding: 6px 8px; text-align: center; border: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; text-align: center; }
  td.rm { color: #0a7ea4; font-size: 10px; }
  td.rank { font-weight: bold; font-size: 14px; color: #666; }
  td.date { color: #666; font-size: 10px; }
  .player-section { margin-bottom: 16px; }
  .page-break { page-break-before: always; margin-top: 24px; }
  .chart { margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 8px; }
  .chart-title { font-size: 11px; color: #666; margin-bottom: 8px; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .bar-label { width: 60px; font-size: 11px; text-align: right; color: #666; }
  .bar-bg { flex: 1; background: #e5e7eb; border-radius: 3px; height: 14px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-val { width: 48px; font-size: 11px; font-weight: bold; }
  .rankings { margin-top: 16px; }
  .rank-section { display: inline-block; width: 30%; vertical-align: top; margin-right: 3%; }
  .rank-table { font-size: 11px; }
  .section-title { font-size: 11px; color: #666; margin: 12px 0 6px; font-weight: 600; }
  .svg-wrap { padding: 8px; background: #f9fafb; border-radius: 8px; }
  .compare-table th { font-size: 10px; background: #f3f4f6; padding: 5px 8px; }
  .compare-table td { font-size: 11px; padding: 5px 8px; }
</style>
</head><body>

<h1>ウエイトトレーニング記録レポート</h1>
<p class="subtitle">期間: ${fromLabel} 〜 ${toLabel}　　出力日: ${new Date().toLocaleDateString("ja-JP")}</p>

${playerSections}

<div class="page-break"></div>
<h2>チームランキング（最新記録）</h2>
<div class="rankings">
  ${rankSection("ベンチプレス", "bench_weight", "#0a7ea4")}
  ${rankSection("デッドリフト", "deadlift_weight", "#ef4444")}
  ${rankSection("スクワット", "squat_weight", "#22c55e")}
</div>

</body></html>`;
}

// ─── MonthPicker ─────────────────────────────────────────────────────────────

function MonthPicker({ label, value, onChange, options, colors, colorScheme }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  colors: (typeof Colors)["light"];
  colorScheme: "light" | "dark";
}) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={pk.wrap}>
      <Text style={[pk.label, { color: colors.icon }]}>{label}</Text>
      <TouchableOpacity
        style={[pk.btn, { borderColor: colors.borderColor, backgroundColor: colors.cardBg }]}
        onPress={() => setVisible(true)}>
        <Text style={[pk.btnText, { color: colors.text }]}>{selected?.label ?? "-"}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.icon} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide">
        <TouchableOpacity style={pk.overlay} onPress={() => setVisible(false)} />
        <View style={[pk.sheet, { backgroundColor: colorScheme === "dark" ? "#2c2c2e" : "#fff" }]}>
          <Text style={[pk.sheetTitle, { color: colors.text }]}>{label}</Text>
          <ScrollView>
            {options.map((opt) => (
              <TouchableOpacity key={opt.value}
                style={[pk.item, { borderBottomColor: colors.borderColor }]}
                onPress={() => { onChange(opt.value); setVisible(false); }}>
                <Text style={[pk.itemText, { color: opt.value === value ? colors.tint : colors.text }]}>
                  {opt.label}
                </Text>
                {opt.value === value && <Ionicons name="checkmark" size={16} color={colors.tint} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const pk = StyleSheet.create({
  wrap: { flex: 1, gap: 4 },
  label: { fontSize: 12 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  btnText: { fontSize: 14, fontWeight: "500" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: { maxHeight: "50%", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  sheetTitle: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemText: { fontSize: 14 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function WeightExportScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const monthOptions = getMonthOptions();

  const [fromMonth, setFromMonth] = useState(monthOptions[0].value);
  const [toMonth, setToMonth] = useState(monthOptions[monthOptions.length - 1].value);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["players_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("players").select("id, name").order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["weight_export_sessions", fromMonth, toMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_sessions").select("*")
        .gte("recorded_at", monthRangeStart(fromMonth))
        .lt("recorded_at", monthRangeEnd(toMonth))
        .order("recorded_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const fromLabel = monthOptions.find((o) => o.value === fromMonth)?.label ?? fromMonth;
  const toLabel = monthOptions.find((o) => o.value === toMonth)?.label ?? toMonth;

  const handleXLSX = async () => {
    if (!sessions.length) { Alert.alert("データなし", "該当期間にデータがありません"); return; }
    setExporting("csv");
    try {
      const b64 = generateXLSX(sessions, players);
      const path = `${FileSystem.cacheDirectory}weight_records_${fromMonth}_${toMonth}.xlsx`;
      await FileSystem.writeAsStringAsync(path, b64, { encoding: "base64" });
      await Sharing.shareAsync(path, {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: "Excelを保存",
      });
    } catch (e) {
      Alert.alert("エラー", String(e));
    } finally {
      setExporting(null);
    }
  };

  const handlePDF = async () => {
    if (!sessions.length) { Alert.alert("データなし", "該当期間にデータがありません"); return; }
    setExporting("pdf");
    try {
      const html = generatePDFHTML(sessions, players, fromLabel, toLabel);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const dest = `${FileSystem.cacheDirectory}weight_report_${fromMonth}_${toMonth}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, { mimeType: "application/pdf", dialogTitle: "PDFを保存" });
    } catch (e) {
      Alert.alert("エラー", String(e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={s.container}>

      {/* 期間選択 */}
      <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <Ionicons name="calendar-outline" size={18} color={colors.tint} />
          <Text style={[s.cardTitle, { color: colors.text }]}>期間選択</Text>
        </View>
        <View style={s.row}>
          <MonthPicker label="開始月" value={fromMonth} onChange={setFromMonth} options={monthOptions} colors={colors} colorScheme={colorScheme} />
          <Text style={[s.arrow, { color: colors.icon }]}>〜</Text>
          <MonthPicker label="終了月" value={toMonth} onChange={setToMonth} options={monthOptions} colors={colors} colorScheme={colorScheme} />
        </View>
      </View>

      {/* 件数プレビュー */}
      <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <Ionicons name="document-text-outline" size={18} color={colors.tint} />
          <Text style={[s.cardTitle, { color: colors.text }]}>対象データ</Text>
        </View>
        {isLoading
          ? <ActivityIndicator color={colors.tint} />
          : <Text style={[s.countText, { color: colors.text }]}>
              {sessions.length} 件 / {new Set(sessions.map((s) => s.player_id)).size} 名
            </Text>
        }
      </View>

      {/* エクスポートボタン */}
      <TouchableOpacity
        style={[s.exportBtn, { borderColor: colors.tint, opacity: exporting || isLoading ? 0.6 : 1 }]}
        onPress={handleXLSX}
        disabled={!!exporting || isLoading}>
        {exporting === "csv"
          ? <ActivityIndicator color={colors.tint} />
          : <><Ionicons name="download-outline" size={18} color={colors.tint} /><Text style={[s.exportBtnText, { color: colors.tint }]}>Excelで出力</Text></>
        }
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.exportBtn, s.exportBtnPDF, { opacity: exporting || isLoading ? 0.6 : 1 }]}
        onPress={handlePDF}
        disabled={!!exporting || isLoading}>
        {exporting === "pdf"
          ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="document-outline" size={18} color="#fff" /><Text style={s.exportBtnPDFText}>PDFで出力</Text></>
        }
      </TouchableOpacity>

      <Text style={[s.note, { color: colors.icon }]}>
        ※ Excelは「全データ」シート＋選手別シート構成です{"\n"}
        ※ PDFには各選手の成長グラフ・前回比較表・記録テーブル・チームランキングが含まれます
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  arrow: { fontSize: 16, paddingBottom: 8 },
  countText: { fontSize: 15, fontWeight: "600" },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 14 },
  exportBtnText: { fontSize: 15, fontWeight: "600" },
  exportBtnPDF: { backgroundColor: "#0a7ea4", borderColor: "transparent" },
  exportBtnPDFText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  note: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
