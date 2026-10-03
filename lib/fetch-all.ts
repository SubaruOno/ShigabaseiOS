// Supabase は1回に最大1000行しか返さない（それ以上は黙って切れる）。
// 1000行ずつ範囲を変えて、全部そろうまで読む。並び順を必ず付けること（付けないと境目で重なったり抜けたりする）。
export const PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  parallel = 4,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE * parallel) {
    const results = await Promise.all(
      Array.from({ length: parallel }, (_, i) => page(start + i * PAGE_SIZE, start + (i + 1) * PAGE_SIZE - 1)),
    );
    let done = false;
    for (const { data, error } of results) {
      if (error) throw error;
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) { done = true; break; }
    }
    if (done) return out;
  }
}
