-- 結果マスタに、入力画面の計算（lib/scoring/engine.ts）が使う種類を持たせる。
-- S=ストライク B=ボール FO=ファウル 1〜4=安打の塁打 out=アウト sac=犠打 sf=犠飛 e=打者が出塁（失策・振り逃げ等）
-- fc=野選 io=打撃・走塁妨害（手で進塁を入れる） hbp=死球 BK=ボーク IBB=申告敬遠。空は計算に使わない結果。
ALTER TABLE public.scoring_results ADD COLUMN IF NOT EXISTS engine_kind text;
UPDATE public.scoring_results r SET engine_kind = v.k FROM (VALUES
  (1,'FO'),(2,'1'),(3,'hbp'),(4,'2'),(5,'2'),(6,'3'),(7,'4'),(8,'e'),(9,'out'),(10,'sac'),(11,'sf'),
  (12,'S'),(13,'S'),(14,'B'),(15,'B'),(16,'out'),(20,'BK'),(21,'io'),(22,'out'),(23,'io'),(24,'e'),
  (30,'fc'),(31,'S'),(32,'S'),(34,'e'),(35,'e'),(36,'fc'),(37,'e'),(38,'out')
) AS v(id,k) WHERE r.id = v.id;
