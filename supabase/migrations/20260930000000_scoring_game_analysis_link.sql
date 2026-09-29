ALTER TABLE public.games ADD COLUMN scoring_game_id uuid UNIQUE REFERENCES public.scoring_games(id) ON DELETE SET NULL;
