export function formatDate(d: string | null): string {
  if (!d) return "—";
  // 日付だけ（YYYY-MM-DD）はそのまま分解する（new Date は端末のタイムゾーンでずれることがある）
  // 時刻付き（試合結果の date など）は日本時間の日付にする。UTCのまま先頭10文字を取ると、朝9時前の試合が前日になる
  if (d.length > 10) {
    const t = new Date(d).getTime();
    if (!Number.isNaN(t)) {
      const jst = new Date(t + 9 * 60 * 60 * 1000);
      return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
    }
  }
  const parts = d.slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  return `${parts[0]}/${Number(parts[1])}/${Number(parts[2])}`;
}
