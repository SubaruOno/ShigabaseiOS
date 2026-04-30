create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

-- 全員読み取り可能（認証不要）
alter table public.app_config enable row level security;
create policy "誰でも読める" on public.app_config
  for select using (true);

-- 初期値
insert into public.app_config (key, value) values
  ('min_ios_version', '1.0.0');
