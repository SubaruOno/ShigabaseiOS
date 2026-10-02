-- 本番の games.date は日時（タイムゾーン付き）。手元の再現用の土台では日付だけになっていたので、本番にそろえる（本番では何もしない）
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='games' AND column_name='date') = 'date' THEN
    ALTER TABLE public.games ALTER COLUMN date TYPE timestamptz USING (date::timestamp AT TIME ZONE 'Asia/Tokyo');
  END IF;
END $$;
