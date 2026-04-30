export function formatDate(d: string | null): string {
  if (!d) return "—";
  // new Date(d) はローカルTZで解釈するため日付がズレる場合がある
  // 文字列から直接分解して安全に表示する
  const parts = d.slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  return `${parts[0]}/${Number(parts[1])}/${Number(parts[2])}`;
}
