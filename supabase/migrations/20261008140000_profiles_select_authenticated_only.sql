-- 部員の名前と背番号は「誰でも読める」設定で、ログインしていない接続からも読めた。
-- 読めるのをログインしている人に絞る（ログイン前の画面は profiles を読まない。新規登録時の作成は SECURITY DEFINER の関数が行う）。
DROP POLICY IF EXISTS "Everyone can view basic profile info" ON public.profiles;
CREATE POLICY "Everyone can view basic profile info" ON public.profiles FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.profiles FROM anon;
