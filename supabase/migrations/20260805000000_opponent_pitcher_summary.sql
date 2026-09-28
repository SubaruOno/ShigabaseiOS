-- 相手投手サマリーをサーバー側で集計するRPC関数
-- 自チーム選手（user_roles.role = 'player'）を除外し、
-- 有効球種（NULL・数値文字列を除く）のみをpitch_countとしてカウントする

DROP FUNCTION IF EXISTS get_opponent_pitcher_summary();
CREATE FUNCTION get_opponent_pitcher_summary()
RETURNS TABLE(
  pitcher_name  text,
  pitcher_hand  text,
  game_count    bigint,
  pitch_count   bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.pitcher_name,
    MAX(p.pitcher_hand)                        AS pitcher_hand,
    COUNT(DISTINCT p.game_id)                  AS game_count,
    COUNT(*) FILTER (
      WHERE p.pitch_type IS NOT NULL
        AND p.pitch_type !~ '^\d+$'
    )                                           AS pitch_count
  FROM pitches p
  WHERE p.pitcher_name IS NOT NULL
    AND p.pitcher_name NOT IN (
      SELECT pr.display_name
      FROM   profiles   pr
      JOIN   user_roles ur ON ur.user_id = pr.id
      WHERE  ur.role = 'player'
        AND  pr.display_name IS NOT NULL
    )
  GROUP BY p.pitcher_name
  ORDER BY COUNT(DISTINCT p.game_id) DESC, p.pitcher_name;
$$;
