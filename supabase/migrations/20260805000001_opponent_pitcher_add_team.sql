-- 相手投手サマリーにチーム名を追加
-- top_bottom='表'（相手チームが守備）→ 投手は home_team
-- top_bottom='裏'（相手チームが守備）→ 投手は away_team

CREATE OR REPLACE FUNCTION get_opponent_pitcher_summary()
RETURNS TABLE(
  pitcher_name  text,
  pitcher_hand  text,
  team_name     text,
  game_count    bigint,
  pitch_count   bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.pitcher_name,
    MAX(p.pitcher_hand) AS pitcher_hand,
    MAX(CASE
      WHEN p.top_bottom = '表' THEN g.home_team
      WHEN p.top_bottom = '裏' THEN g.away_team
    END) AS team_name,
    COUNT(DISTINCT p.game_id)  AS game_count,
    COUNT(*) FILTER (
      WHERE p.pitch_type IS NOT NULL
        AND p.pitch_type !~ '^\d+$'
    )                           AS pitch_count
  FROM pitches p
  JOIN games g ON g.id = p.game_id
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
