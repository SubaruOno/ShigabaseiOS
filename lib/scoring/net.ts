// 通信が切れていたり電波が弱くても画面を止めない。待ちきれなければ { data: null } を返し、呼ぶ側は端末の控えを使う
export const withTimeout = <T,>(q: PromiseLike<T>, ms = 5000): Promise<T> =>
  Promise.race([Promise.resolve(q), new Promise<T>(r => setTimeout(() => r({ data: null, error: { message: "timeout" } } as any), ms))]).catch(() => ({ data: null, error: { message: "offline" } }) as any);

// 同期のように何度やり直しても同じ結果になる処理を、待ちすぎたら打ち切ってエラーにする
export const failAfter = <T,>(p: Promise<T>, ms: number, message: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
