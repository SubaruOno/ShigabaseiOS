-- documents / videos テーブルへの INSERT 時に notify-on-insert Edge Function を呼び出すトリガー
-- これにより、どのクライアント（モバイルアプリ・ウェブアプリ等）からの投稿でも通知が届く

-- pg_net 拡張を有効化（Supabase ではデフォルトで使用可能）
create extension if not exists pg_net with schema extensions;

-- INSERT 時に Edge Function を呼び出す共通関数
create or replace function public.notify_content_insert()
returns trigger
security definer
language plpgsql
as $$
begin
  perform net.http_post(
    url    := 'https://qmbqywqtkstwswslgnvo.supabase.co/functions/v1/notify-on-insert',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtYnF5d3F0a3N0d3N3c2xnbnZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MDYzODksImV4cCI6MjA3NTk4MjM4OX0.itHrms_BSX4QWdnredNhYshSSEAL-mli2Eso9DvHNTc'
    ),
    body   := jsonb_build_object(
      'table',  TG_TABLE_NAME,
      'record', row_to_json(NEW)
    )
  );
  return new;
end;
$$;

-- documents テーブルのトリガー
create trigger on_document_insert
  after insert on public.documents
  for each row execute function public.notify_content_insert();

-- videos テーブルのトリガー
create trigger on_video_insert
  after insert on public.videos
  for each row execute function public.notify_content_insert();
