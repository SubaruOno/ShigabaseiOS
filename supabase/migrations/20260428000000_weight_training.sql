-- ウエイトトレーニング記録テーブル
CREATE TABLE weight_sessions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id         uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recorded_at       date NOT NULL,

  -- ビッグ3（最大重量とその回数）
  bench_weight      numeric(5,1),
  bench_reps        int,
  deadlift_weight   numeric(5,1),
  deadlift_reps     int,
  squat_weight      numeric(5,1),
  squat_reps        int,

  -- 1RM 自動計算（Brzycki変形: weight * (1 + reps/40)）
  bench_1rm         numeric(6,2) GENERATED ALWAYS AS
                      (CASE WHEN bench_weight IS NOT NULL AND bench_reps IS NOT NULL
                        THEN bench_weight * (1 + bench_reps::numeric / 40)
                        ELSE NULL END) STORED,
  deadlift_1rm      numeric(6,2) GENERATED ALWAYS AS
                      (CASE WHEN deadlift_weight IS NOT NULL AND deadlift_reps IS NOT NULL
                        THEN deadlift_weight * (1 + deadlift_reps::numeric / 40)
                        ELSE NULL END) STORED,
  squat_1rm         numeric(6,2) GENERATED ALWAYS AS
                      (CASE WHEN squat_weight IS NOT NULL AND squat_reps IS NOT NULL
                        THEN squat_weight * (1 + squat_reps::numeric / 40)
                        ELSE NULL END) STORED,

  -- 身体データ（任意・変化があった時のみ入力）
  body_weight_kg    numeric(4,1),
  body_fat_pct      numeric(4,1),
  lean_mass_kg      numeric(4,1),

  -- 自由記述（その他種目など）
  other_exercises   text,

  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX ON weight_sessions (player_id, recorded_at DESC);

-- date_trunc はSTABLEのためインデックス不可 → IMMUTABLEラッパー関数で対応
CREATE OR REPLACE FUNCTION month_of_date(d date) RETURNS date
  LANGUAGE sql IMMUTABLE AS
  'SELECT date_trunc(''month'', d)::date';

-- 同じ選手が同じ月に複数回入力できないよう制約
CREATE UNIQUE INDEX weight_sessions_player_month_unique
  ON weight_sessions (player_id, month_of_date(recorded_at));

-- 選手ごとの目標重量テーブル（管理者が設定）
CREATE TABLE player_weight_goals (
  player_id         uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  bench_goal_kg     numeric(5,1),
  deadlift_goal_kg  numeric(5,1),
  squat_goal_kg     numeric(5,1),
  updated_by        uuid REFERENCES auth.users(id),
  updated_at        timestamptz DEFAULT now()
);

-- RLS有効化
ALTER TABLE weight_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_weight_goals ENABLE ROW LEVEL SECURITY;

-- weight_sessions ポリシー
-- 選手: 自分のレコードのみ閲覧・挿入
CREATE POLICY "players_select_own_sessions" ON weight_sessions
  FOR SELECT USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "players_insert_own_sessions" ON weight_sessions
  FOR INSERT WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- アナリスト・管理者: 全件閲覧
CREATE POLICY "staff_select_all_sessions" ON weight_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('analyst', 'admin')
    )
  );

-- 管理者: 全件挿入・更新・削除
CREATE POLICY "admin_all_sessions" ON weight_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- player_weight_goals ポリシー
-- 選手: 自分の目標を閲覧
CREATE POLICY "players_select_own_goals" ON player_weight_goals
  FOR SELECT USING (
    player_id IN (
      SELECT id FROM players WHERE user_id = auth.uid()
    )
  );

-- アナリスト・管理者: 全件閲覧
CREATE POLICY "staff_select_all_goals" ON player_weight_goals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('analyst', 'admin')
    )
  );

-- 管理者: 全件操作
CREATE POLICY "admin_all_goals" ON player_weight_goals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
