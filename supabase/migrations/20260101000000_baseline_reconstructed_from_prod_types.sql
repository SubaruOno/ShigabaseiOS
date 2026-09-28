-- Local-only reconstructed baseline from shigabase-prod-types.ts.
-- DO NOT PUSH TO PRODUCTION: these base objects already exist in production.
CREATE TYPE public.app_role AS ENUM ('player', 'analyst', 'admin', 'ob');
CREATE TYPE public.content_type AS ENUM ('document', 'video');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  uniform_number integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  excel_name text,
  university text,
  user_id uuid,
  display_order integer,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.opponent_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date,
  season text,
  kind text,
  week integer,
  game_number integer,
  home_team text,
  away_team text,
  home_score integer,
  away_score integer,
  home_runs_per_inning integer[],
  away_runs_per_inning integer[],
  scorekeeper text,
  youtube_url text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.pitches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  play_number integer,
  inning integer,
  top_bottom text,
  offense_team text,
  batter_order integer,
  batter_name text,
  batter_hand text,
  pitcher_name text,
  pitcher_hand text,
  catcher_name text,
  runner_1st text,
  runner_2nd text,
  runner_3rd text,
  balls integer,
  strikes integer,
  outs integer,
  pa_complete text,
  pitch_count integer,
  pitch_type text,
  pitch_speed numeric,
  course_x numeric,
  course_y numeric,
  batting_result text,
  batting_result2 text,
  hit_type text,
  hit_strength text,
  hit_x numeric,
  hit_y numeric,
  strategy text,
  strategy2 text,
  strategy_result text,
  error_type text,
  fielder text,
  created_at timestamptz DEFAULT now()
);
-- Compatibility tables referenced by the existing generated type snapshot.
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  type public.content_type NOT NULL DEFAULT 'video', page_type text NOT NULL DEFAULT 'default',
  display_order integer, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  file_url text NOT NULL, category_id uuid REFERENCES public.categories(id),
  player_id uuid REFERENCES public.players(id), team1_id uuid REFERENCES public.opponent_teams(id),
  team2_id uuid REFERENCES public.opponent_teams(id), uploaded_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  file_url text NOT NULL, youtube_url text, category_id uuid REFERENCES public.categories(id),
  player_id uuid REFERENCES public.players(id), team1_id uuid REFERENCES public.opponent_teams(id),
  team2_id uuid REFERENCES public.opponent_teams(id), uploaded_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.app_config(key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user1_id uuid NOT NULL, user2_id uuid NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.conversations(id), sender_id uuid NOT NULL, content text NOT NULL, is_read boolean DEFAULT false, file_url text, file_name text, file_type text, file_size bigint, created_at timestamptz DEFAULT now());
CREATE TABLE public.invite_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, player_name text NOT NULL, role text NOT NULL DEFAULT 'player', player_id uuid REFERENCES public.players(id), uniform_number integer, created_by uuid NOT NULL, used boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.push_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, token text NOT NULL, updated_at timestamptz DEFAULT now());
CREATE TABLE public.game_uploads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES public.games(id), file_name text, uploaded_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.game_durations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES public.games(id), inning integer NOT NULL, top_bottom text NOT NULL, seconds integer NOT NULL);
CREATE TABLE public.bullpen_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.profiles(id), date date NOT NULL, session_name text, created_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.bullpen_pitches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.bullpen_sessions(id), pitch_number integer NOT NULL, pitch_type text NOT NULL, is_strike boolean NOT NULL, pitch_speed numeric, course_x numeric, course_y numeric, created_at timestamptz NOT NULL DEFAULT now());

