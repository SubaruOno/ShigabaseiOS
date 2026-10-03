// デバックチェック：分析シート_修正版.xlsm の「デバツクチェッカー」と同じ確認を、191列の行に対して行う。
// 列番号は旧Excelと同じ1始まり（8＝後攻チーム、40＝打者状況、46＝打撃結果 など）。
// 旧マクロと同じく、1行につき最初に見つかった1件だけを挙げる。継続・完了の印が崩れているときは「致命的」として、そこで止める。
export type DebugIssue = { row: number; col: number; value: string; label: string; fatal?: boolean };

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

/** rows：見出しを除いた191列の行（0始まりの配列。列 c は rows[i][c-1]）。switchHitters：両打ちとして登録された選手名（左右が混ざっても挙げない） */
export function debugCheck(rows: unknown[][], switchHitters: Set<string> = new Set()): DebugIssue[] {
  const at = (i: number, c: number) => str(rows[i]?.[c - 1]);
  const issues: DebugIssue[] = [];

  // 致命的エラー（継続・完了の印）
  for (let i = 0; i < rows.length; i++) {
    const next = i + 1 < rows.length;
    const add = (col: number, label: string) => issues.push({ row: i, col, value: at(i, col), label, fatal: true });
    const S = at(i, 19), S1 = next ? at(i + 1, 19) : "";
    if (S === "イニング完了" && S1 !== "" && S1 !== "イニング開始") { add(19, "イニング継続"); continue; }
    if (S === "イニング継続" && S1 === "イニング開始") { add(19, "イニング継続"); continue; }
    if (!["イニング完了", "イニング開始", "イニング継続"].includes(S)) { add(19, "イニング継続"); continue; }
    const T = at(i, 20), T1 = next ? at(i + 1, 20) : "";
    if (T === "試合終了" && T1 !== "" && T1 !== "試合開始") { add(20, "試合継続"); continue; }
    if (!["試合終了", "試合開始", "試合継続"].includes(T)) { add(20, "試合継続"); continue; }
    const R = at(i, 18), AN = at(i, 40);
    if (AN !== "0" && R !== "打席完了") { add(18, "打席の継続"); continue; }
    if (AN === "0" && R === "打席完了") { add(18, "打席の継続"); continue; }
    if (R !== "打席完了" && R !== "打席継続") { add(18, "打席の継続"); continue; }
  }
  if (issues.length) return issues;

  const batR = new Set<string>(), batL = new Set<string>(), pitR = new Set<string>(), pitL = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const has = i + 1 < rows.length;
    const n = (c: number) => (has ? at(i + 1, c) : "");
    const v = (c: number) => at(i, c);
    const check = (): [number, string] | null => {
      // 空白は基本的になし（8〜56列、36列の捕手を除く）
      for (let m = 8; m <= 56; m++) { if (m === 36) continue; if (v(m) === "") return [m, "空白は基本的になし"]; }
      // 試合の途中の行どうし：チーム名は変わらず、得点は減らない
      if (has && n(20) !== "試合開始" && n(20) !== "") {
        if (v(8) !== n(8)) return [8, "チーム名"];
        if (v(9) !== n(9)) return [9, "チーム名"];
        if (num(v(13)) > num(n(13))) return [13, "得点"];
        if (num(v(14)) > num(n(14))) return [14, "得点"];
      }
      // 打席の途中でストライク・ボールが減らない（旧マクロは次の行が空のときだけ見ていたが、意図どおり次の行と比べる）
      if (has && v(18) !== "打席完了" && v(19) !== "イニング完了" && n(20) !== "試合開始") { // 牽制死・盗塁死でイニングが終わると、打席の途中でもカウントは戻る
        if (num(v(15)) > num(n(15))) return [15, "ストライク・ボール"];
        if (num(v(16)) > num(n(16))) return [16, "ストライク・ボール"];
      }
      // イニングの途中でアウトが減らない
      if (has && v(19) !== "イニング完了" && n(20) !== "試合開始") {
        if (num(v(17)) > num(n(17))) return [17, "アウト"];
      }
      // ランナー：打順と氏名は両方あるか両方0
      for (const [o, name] of [[21, 22], [23, 24], [25, 26]]) if ((v(o) === "0") !== (v(name) === "0")) return [o, "ランナー"];
      // 打者
      const order = v(27); if (!((num(order) >= 1 && num(order) <= 9) || order === "H")) return [27, "打者"];
      if (v(29) !== "右" && v(29) !== "左") return [29, "打者"];
      // 作戦：作戦・作戦２・作戦結果は全部入っているか全部0
      const planCount = [30, 31, 32].filter(c => v(c) !== "0").length;
      if (planCount === 1 || planCount === 2) return [30, "作戦"];
      const kinds: Record<string, string[]> = {
        "1バント": ["打の構えからバント", "セットからバント構え", "バント", "バスターからバント"],
        "2バスター": ["バスター", "打の構えからバスター", "セットからバスター"],
        "3セフティ": ["セフティ", "プッシュ", "ドラック"],
        "4エンドラン系": ["HAR", "RAH", "BSAR", "RABS", "BAR", "RAB"],
        "5盗塁": ["ダブルスチール", "ディレードスチール", "盗塁"],
        "6スクイズ": ["スクイズ", "Sスクイズ", "擬似スクイズ"],
        "7急発進": ["急発進", "急停止", "転倒"], "7急停止": ["急発進", "急停止", "転倒"], "7転倒": ["急発進", "急停止", "転倒"],
        "8特殊打法": ["当て逃げ", "バスター打法"],
      };
      if (kinds[v(30)] && !kinds[v(30)].includes(v(31))) return [31, "作戦"];
      if (!["5盗塁", "7急発進", "7急停止", "7転倒", "0"].includes(v(30))) {
        const ok = ["単打", "見逃し", "見逃し三振", "空振り", "ハーフスイング", "空振り三振", "振り逃げ", "ボール", "四球", "死球", "ファール", "エラー", "犠打", "野手選択", "成功", "失敗", "牽制", "凡打死", "凡打出塁", "ファールフライ"];
        if (!ok.includes(v(32))) return [32, "成功or失敗"];
      }
      // 捕手（旧マクロは33列を見ている）・投手の左右
      if (v(41) === "投球" && v(33) === "") return [33, "捕手"];
      if (v(34) !== "右" && v(34) !== "左") return [34, "投手"];
      // 走塁状況：走者がいるのに状況が0、いないのに状況がある。偽投は牽制の行だけ
      for (let k = 1; k <= 3; k++) {
        const nameCol = 22 + 2 * (k - 1), stat = 36 + k;
        if (v(nameCol) !== "0" && v(stat) === "0") return [stat, "走塁状況"];
        if (v(nameCol) === "0" && v(stat) !== "0") return [stat, "走塁状況"];
        if (v(41) !== "牽制" && v(stat) === "偽投") return [stat, "３Ｒ偽投対策"];
      }
      // 進塁定義：進んだはずの塁に、次の行で走者がいない
      if (has && v(19) !== "イニング完了") {
        if (v(40) === "出塁" && n(37) === "0") return [37, "進塁定義"];
        if (v(40) === "二進" && n(38) === "0") return [38, "進塁定義"];
        if (v(40) === "三進" && n(39) === "0") return [39, "進塁定義"];
        if (v(37) === "二進" && n(38) === "0") return [38, "進塁定義"];
        if (v(37) === "三進" && n(39) === "0") return [39, "進塁定義"];
        if (v(38) === "三進" && n(39) === "0") return [39, "進塁定義"];
      }
      // 構え・コース（投球の行）
      if (v(41) === "投球") {
        if (!(num(v(42)) >= 1 && num(v(42)) <= 25)) return [42, "構え／コース"];
        if (!(num(v(43)) >= 0 && num(v(43)) <= 264)) return [43, "構え／コース"];
        if (!(num(v(44)) >= 0 && num(v(44)) <= 264)) return [44, "構え／コース"];
      }
      // 球種：投球の行は必ずあり、それ以外は0
      if (v(41) === "投球" && v(45) === "0") return [45, "球種"];
      if (v(41) !== "投球" && v(45) !== "0") return [45, "球種"];
      // 打者状況と結果
      const res = v(46);
      if (["見逃し", "空振り", "ハーフスイング", "ボール", "ファール"].includes(res) && ["0", "PB", "WP"].includes(v(47)) && v(40) !== "0") return [40, "打者状況"];
      if (["見逃し三振", "空振り三振", "K3", "凡打死", "犠打", "犠飛", "ファールフライ"].includes(res) && v(40) !== "アウト") return [40, "打者状況"];
      // ４アウト
      const outs = [37, 38, 39, 40].filter(c => ["封殺", "アウト", "投手牽制死", "捕手牽制死"].includes(v(c))).length;
      if (outs + num(v(17)) >= 4) return [40, "４アウト"];
      // 本当に三振・四球か
      if (num(v(15)) <= 1 && ["見逃し三振", "空振り三振", "K3", "振り逃げ"].includes(res)) return [46, "本当に三振？"];
      if (num(v(16)) <= 2 && res === "四球") return [46, "本当に四球？"];
      // 打球方向・捕球選手
      if (["凡打死", "凡打出塁", "ファールフライ", "ファール", "単打", "二塁打", "エンタイトル", "三塁打", "本塁打", "ランニング本塁打", "犠打", "犠飛", "エラー", "野手選択"].includes(res)) {
        if (v(51) === "0" || v(52) === "0") return [51, "打球方向 or 捕球選手"];
        if (res !== "ファール" && (v(48) === "0" || v(49) === "0")) return [48, "打球方向 or 捕球選手"];
      }
      // 牽制
      if (v(41) === "牽制") {
        if (v(53) === "0" || v(54) === "0") return [53, "牽制関係"];
        if (v(53) === "一塁牽制" && v(37) === "0") return [53, "牽制関係"];
        if (v(53) === "二塁牽制" && v(38) === "0") return [53, "牽制関係"];
        if (v(53) === "三塁牽制" && v(39) === "0") return [53, "牽制関係"];
        if (v(53) === "Ｗ牽制" && (v(37) === "0" || v(39) === "0")) return [53, "牽制関係"];
      }
      return null;
    };
    const hit = check();
    if (hit) issues.push({ row: i, col: hit[0], value: v(hit[0]), label: hit[1] });
    // 同じ選手の左右（両打ちは除く）
    if (v(28) !== "0" && !switchHitters.has(v(28))) (v(29) === "右" ? batR : v(29) === "左" ? batL : new Set<string>()).add(v(28));
    if (v(33) !== "0") (v(34) === "右" ? pitR : v(34) === "左" ? pitL : new Set<string>()).add(v(33));
  }
  for (const name of batR) if (batL.has(name)) issues.push({ row: -1, col: 29, value: name, label: "打者名（右と左が混ざっている）" });
  for (const name of pitR) if (pitL.has(name)) issues.push({ row: -1, col: 34, value: name, label: "投手名（右と左が混ざっている）" });
  return issues;
}
