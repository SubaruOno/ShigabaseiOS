-- games テーブルへの INSERT 時に notify-on-insert Edge Function を呼び出すトリガー
create trigger on_game_insert
  after insert on public.games
  for each row execute function public.notify_content_insert();
