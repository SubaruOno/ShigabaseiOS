-- ブルペンの投手一覧は「選手」の役割を持つ人を user_roles から読む。
-- これまでは admin しか全員分を読めず、admin でないアナリストは一覧が空になって記録できなかった。
-- 選手の役割の行だけを、ログインしている人なら読めるようにする（アナリスト・admin・OB の行は今までどおり見えない）。
DROP POLICY IF EXISTS "Authenticated can view player roles" ON public.user_roles;
CREATE POLICY "Authenticated can view player roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (role = 'player'::public.app_role);
