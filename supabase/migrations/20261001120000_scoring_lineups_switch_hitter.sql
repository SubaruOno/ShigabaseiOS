-- 両打ちの選手（選手マスタの bat_hand = 'S'）を先発メンバーにも入れられるようにする
ALTER TABLE public.scoring_lineups DROP CONSTRAINT IF EXISTS scoring_lineups_batting_hand_check;
ALTER TABLE public.scoring_lineups ADD CONSTRAINT scoring_lineups_batting_hand_check CHECK (batting_hand IN ('L','R','S'));
