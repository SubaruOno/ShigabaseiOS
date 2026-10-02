-- 試合記録の同期は、2回目以降に試合結果（games）の点数などを直し、投球（pitches）を入れ替える。
-- 本番には「読み取り」と「追加」の決まりしかなく、上書きと削除がエラーも出ずに素通りして投球が2重になるため、
-- アナリストと管理者に上書き・削除を許す。手元の環境も本番と同じ決まりにそろえる。
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='authenticated_read_games') THEN
    CREATE POLICY authenticated_read_games ON public.games FOR SELECT USING (auth.role() = 'authenticated'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='authenticated_insert_games') THEN
    CREATE POLICY authenticated_insert_games ON public.games FOR INSERT WITH CHECK (auth.role() = 'authenticated'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='authenticated_read_pitches') THEN
    CREATE POLICY authenticated_read_pitches ON public.pitches FOR SELECT USING (auth.role() = 'authenticated'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='authenticated_insert_pitches') THEN
    CREATE POLICY authenticated_insert_pitches ON public.pitches FOR INSERT WITH CHECK (auth.role() = 'authenticated'); END IF;
END $$;
CREATE POLICY analyst_update_games ON public.games FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin'));
CREATE POLICY analyst_delete_games ON public.games FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin'));
CREATE POLICY analyst_update_pitches ON public.pitches FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin'));
CREATE POLICY analyst_delete_pitches ON public.pitches FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin'));
