-- First phase of the local scoring data model. New records remain namespaced.
CREATE TABLE public.scoring_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, name_s text NOT NULL DEFAULT '',
  name_e text NOT NULL DEFAULT '', name_es text NOT NULL DEFAULT '', kind text NOT NULL DEFAULT 'league',
  show_index integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scoring_stadiums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, name_s text NOT NULL DEFAULT '',
  name_e text NOT NULL DEFAULT '', name_es text NOT NULL DEFAULT '', capacity integer, left_distance numeric,
  center_distance numeric, right_distance numeric, home_team_id uuid REFERENCES public.opponent_teams(id),
  stadium_type text, shape text, show_index integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opponent_teams ADD COLUMN name_s text NOT NULL DEFAULT '';
ALTER TABLE public.opponent_teams ADD COLUMN name_e text NOT NULL DEFAULT '';
ALTER TABLE public.opponent_teams ADD COLUMN name_es text NOT NULL DEFAULT '';
ALTER TABLE public.opponent_teams ADD COLUMN category_id uuid REFERENCES public.scoring_categories(id);
ALTER TABLE public.opponent_teams ADD COLUMN stadium_id uuid REFERENCES public.scoring_stadiums(id);
ALTER TABLE public.opponent_teams ADD COLUMN mark text;
ALTER TABLE public.opponent_teams ADD COLUMN is_own_team boolean NOT NULL DEFAULT false;
ALTER TABLE public.opponent_teams ADD COLUMN league text;
ALTER TABLE public.opponent_teams ADD COLUMN created_by uuid;
ALTER TABLE public.games ADD COLUMN home_team_id uuid REFERENCES public.opponent_teams(id);
ALTER TABLE public.games ADD COLUMN away_team_id uuid REFERENCES public.opponent_teams(id);

CREATE TABLE public.scoring_positions (
  id smallint PRIMARY KEY, name text NOT NULL, name_s text NOT NULL, group_kind text NOT NULL CHECK (group_kind IN ('field','role')),
  show_index integer NOT NULL UNIQUE
);
CREATE TABLE public.scoring_roster_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES public.opponent_teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL, name text NOT NULL, name_s text NOT NULL DEFAULT '',
  name_e text NOT NULL DEFAULT '', name_es text NOT NULL DEFAULT '', retired boolean NOT NULL DEFAULT false,
  affiliation text, note text, throw_hand text CHECK (throw_hand IN ('L','R','S')),
  bat_hand text CHECK (bat_hand IN ('L','R','S')), pitching_form text,
  primary_position_id smallint REFERENCES public.scoring_positions(id), show_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scoring_player_careers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), roster_player_id uuid NOT NULL REFERENCES public.scoring_roster_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.opponent_teams(id), start_date date, end_date date,
  uniform_no text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scoring_name_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), roster_player_id uuid NOT NULL REFERENCES public.scoring_roster_players(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE, source text NOT NULL DEFAULT 'legacy_excel', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scoring_results (
  id smallint PRIMARY KEY, name text NOT NULL, name_s text NOT NULL, name_e text NOT NULL DEFAULT '', name_es text NOT NULL DEFAULT '',
  division smallint NOT NULL, last_id smallint NOT NULL, stats_id smallint NOT NULL,
  strike_flag boolean NOT NULL DEFAULT false, ball_flag boolean NOT NULL DEFAULT false, out_flag boolean NOT NULL DEFAULT false,
  runs smallint NOT NULL DEFAULT 0, last_ball boolean NOT NULL DEFAULT false, tag_up boolean NOT NULL DEFAULT false,
  bunt boolean NOT NULL DEFAULT false, bat_must_chk boolean NOT NULL DEFAULT false, batting_flag boolean NOT NULL DEFAULT false,
  pitcher_flag boolean NOT NULL DEFAULT false, display_flag boolean NOT NULL DEFAULT false,
  ground_allowed boolean NOT NULL DEFAULT false, fly_allowed boolean NOT NULL DEFAULT false, liner_allowed boolean NOT NULL DEFAULT false,
  list_id smallint NOT NULL DEFAULT 0, list_x smallint NOT NULL DEFAULT 0, list_y smallint NOT NULL DEFAULT 0,
  button_color text NOT NULL DEFAULT 'black', ball_color text NOT NULL DEFAULT 'black', summary_code text,
  old_excel_label text NOT NULL DEFAULT '', show_index integer NOT NULL DEFAULT 0
);
CREATE TABLE public.scoring_plans (
  id smallint PRIMARY KEY, name text NOT NULL, name_s text NOT NULL DEFAULT '', name_e text NOT NULL DEFAULT '', name_es text NOT NULL DEFAULT '',
  division smallint NOT NULL, show_index integer NOT NULL DEFAULT 0, bunt_flag boolean NOT NULL DEFAULT false,
  and_run_flag boolean NOT NULL DEFAULT false, steal_flag boolean NOT NULL DEFAULT false,
  sb_flag boolean NOT NULL DEFAULT false, cs_flag boolean NOT NULL DEFAULT false,
  display_flag boolean NOT NULL DEFAULT true, old_excel_label text NOT NULL DEFAULT ''
);
CREATE TABLE public.scoring_ball_types (
  id smallint PRIMARY KEY, name text NOT NULL, name_s text NOT NULL DEFAULT '', symbol text NOT NULL DEFAULT '',
  family_id smallint NOT NULL DEFAULT 0, stats_kind smallint NOT NULL DEFAULT 0,
  right_glyph text NOT NULL DEFAULT '', right_color text NOT NULL DEFAULT '', left_glyph text NOT NULL DEFAULT '', left_color text NOT NULL DEFAULT '',
  display_flag boolean NOT NULL DEFAULT false, show_index integer NOT NULL DEFAULT 0, old_excel_label text NOT NULL DEFAULT ''
);
CREATE TABLE public.scoring_pickoff_details (
  id smallint PRIMARY KEY, base smallint NOT NULL CHECK (base BETWEEN 1 AND 3), name text NOT NULL,
  order_by integer NOT NULL, UNIQUE(base,name)
);
CREATE TABLE public.scoring_memos (
  id smallint PRIMARY KEY, name text NOT NULL, division smallint NOT NULL DEFAULT 1, show_index integer NOT NULL DEFAULT 0
);
CREATE TABLE public.scoring_weather (
  id smallint PRIMARY KEY, name text NOT NULL UNIQUE, show_index integer NOT NULL UNIQUE
);

CREATE TABLE public.scoring_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_game_number text NOT NULL UNIQUE,
  game_date date NOT NULL, game_time time NOT NULL, stadium_id uuid REFERENCES public.scoring_stadiums(id),
  weather_id smallint REFERENCES public.scoring_weather(id), method text NOT NULL CHECK (method IN ('live','video')),
  home_team_id uuid NOT NULL REFERENCES public.opponent_teams(id), away_team_id uuid NOT NULL REFERENCES public.opponent_teams(id),
  season text NOT NULL, kind text NOT NULL, week text NOT NULL, day text NOT NULL, game_number integer NOT NULL,
  umpire text, scorer text, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','suspended')),
  winning_pitcher_id uuid REFERENCES public.scoring_roster_players(id), losing_pitcher_id uuid REFERENCES public.scoring_roster_players(id),
  save_pitcher_id uuid REFERENCES public.scoring_roster_players(id), tags text[] NOT NULL DEFAULT '{}',
  master_version jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id), UNIQUE(season,kind,week,day,game_number)
);
CREATE TABLE public.scoring_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES public.scoring_games(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.opponent_teams(id), slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 10),
  roster_player_id uuid NOT NULL REFERENCES public.scoring_roster_players(id), position_id smallint NOT NULL REFERENCES public.scoring_positions(id),
  batting_hand text CHECK (batting_hand IN ('L','R')), throwing_hand text CHECK (throwing_hand IN ('L','R')),
  uniform_no text, ohtani_rule boolean NOT NULL DEFAULT false, player_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(game_id,team_id,slot)
);
CREATE TABLE public.scoring_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES public.scoring_games(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq > 0), input_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_state jsonb NOT NULL DEFAULT '{}'::jsonb, device_id text, client_mutation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid DEFAULT auth.uid(),
  UNIQUE(game_id,seq), UNIQUE(game_id,client_mutation_id)
);
CREATE TABLE public.scoring_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES public.scoring_games(id) ON DELETE CASCADE,
  seq integer NOT NULL, team_id uuid NOT NULL REFERENCES public.opponent_teams(id), slot smallint NOT NULL,
  replaced_player_id uuid REFERENCES public.scoring_roster_players(id), incoming_player_id uuid NOT NULL REFERENCES public.scoring_roster_players(id),
  position_id smallint REFERENCES public.scoring_positions(id), inning smallint NOT NULL, half smallint NOT NULL CHECK (half IN (0,1)),
  occurred_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid()
);
CREATE TABLE public.scoring_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, game_id uuid REFERENCES public.scoring_games(id) ON DELETE CASCADE,
  play_id uuid REFERENCES public.scoring_plays(id) ON DELETE SET NULL, actor_id uuid DEFAULT auth.uid(), action text NOT NULL,
  old_data jsonb, new_data jsonb, mutation_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.scoring_is_team_member(_game_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT EXISTS (SELECT 1 FROM scoring_games g JOIN opponent_teams t ON t.id IN (g.home_team_id,g.away_team_id) WHERE g.id=_game_id AND (t.is_own_team OR has_role(auth.uid(),'analyst') OR has_role(auth.uid(),'admin'))) $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['scoring_games','scoring_lineups','scoring_plays','scoring_substitutions','scoring_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    IF t = 'scoring_games' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.scoring_is_team_member(id))',t||'_team_read',t);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.scoring_is_team_member(game_id))',t||'_team_read',t);
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (has_role(auth.uid(),''analyst'') OR has_role(auth.uid(),''admin'')) WITH CHECK (has_role(auth.uid(),''analyst'') OR has_role(auth.uid(),''admin''))',t||'_analyst_write',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['scoring_categories','scoring_stadiums','scoring_positions','scoring_roster_players','scoring_player_careers','scoring_name_aliases','scoring_results','scoring_plans','scoring_ball_types','scoring_pickoff_details','scoring_memos','scoring_weather'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',t||'_authenticated_read',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (has_role(auth.uid(),''analyst'') OR has_role(auth.uid(),''admin'')) WITH CHECK (has_role(auth.uid(),''analyst'') OR has_role(auth.uid(),''admin''))',t||'_analyst_write',t);
  END LOOP;
END $$;
