-- 1) チームの表は、本番では管理者しか書けない。マスター管理（アナリストも使う）でチームを足す・直すと、エラーも出ずに何も変わらない。
--    アナリストにも書き込みを許す。手元の環境も本番と同じ決まりにそろえる。
ALTER TABLE public.opponent_teams ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.opponent_teams'::regclass AND polname='Everyone can view opponent teams') THEN
    CREATE POLICY "Everyone can view opponent teams" ON public.opponent_teams FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.opponent_teams'::regclass AND polname='Admins can manage opponent teams') THEN
    CREATE POLICY "Admins can manage opponent teams" ON public.opponent_teams FOR ALL USING (has_role(auth.uid(),'admin')); END IF;
END $$;
CREATE POLICY analyst_manage_opponent_teams ON public.opponent_teams FOR ALL TO authenticated
  USING (has_role(auth.uid(),'analyst')) WITH CHECK (has_role(auth.uid(),'analyst'));
-- 2) 変更の記録（scoring_audit_log）はアプリから書かないので、読み取りだけにする（記録を書き換え・削除できないようにする）
DROP POLICY IF EXISTS scoring_audit_log_analyst_write ON public.scoring_audit_log;
