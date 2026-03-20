-- Add ClusterR/ClusterL columns to pitcher_season_command
ALTER TABLE pitcher_season_command
  ADD COLUMN IF NOT EXISTS avg_cluster_r numeric,
  ADD COLUMN IF NOT EXISTS avg_cluster_l numeric,
  ADD COLUMN IF NOT EXISTS cluster_r_plus numeric,
  ADD COLUMN IF NOT EXISTS cluster_l_plus numeric;
