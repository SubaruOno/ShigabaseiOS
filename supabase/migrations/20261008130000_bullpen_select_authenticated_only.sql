-- ブルペンの記録は「誰でも読める」設定で、ログインしていない接続からも読めた。
-- 読めるのをログインしている人に絞る（アプリの画面はすべてログイン後なので、見え方は変わらない）。
DROP POLICY IF EXISTS bullpen_sessions_select ON public.bullpen_sessions;
CREATE POLICY bullpen_sessions_select ON public.bullpen_sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bullpen_pitches_select ON public.bullpen_pitches;
CREATE POLICY bullpen_pitches_select ON public.bullpen_pitches FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.bullpen_sessions FROM anon;
REVOKE ALL ON public.bullpen_pitches FROM anon;
