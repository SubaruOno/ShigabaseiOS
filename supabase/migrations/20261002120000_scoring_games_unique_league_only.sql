-- 「季節・種別・週・日・第何試合」が同じ試合を1つに限るのはリーグ戦だけにする。
-- オープン戦などは週・日・第何試合を持たない（旧Excelのファイル名も「オープン戦--」）ので、同じ日に何試合あってもよい
ALTER TABLE public.scoring_games DROP CONSTRAINT IF EXISTS scoring_games_season_kind_week_day_game_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS scoring_games_league_key ON public.scoring_games (season, kind, week, day, game_number) WHERE kind = 'リーグ戦';
