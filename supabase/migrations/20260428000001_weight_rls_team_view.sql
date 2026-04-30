-- 選手もチーム全員のウエイトデータを閲覧できるよう更新
-- （チーム内ランキング・平均グラフ表示のため）
DROP POLICY IF EXISTS "players_select_own_sessions" ON weight_sessions;

CREATE POLICY "authenticated_select_all_sessions" ON weight_sessions
  FOR SELECT USING (auth.uid() IS NOT NULL);
