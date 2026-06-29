-- ============================================================
-- GESTÃO DE ATIVOS TI — Schema Supabase
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- Extensão para UUIDs
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELA: perfis de usuário (vinculada ao auth.users do Supabase)
-- ============================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  role       text not null default 'auditor' check (role in ('admin','tecnico','auditor')),
  ativo      boolean not null default true,
  created_at timestamptz default now()
);

-- ============================================================
-- TABELA: ativos
-- ============================================================
create table public.ativos (
  id          uuid primary key default uuid_generate_v4(),
  codigo      text unique not null,          -- IT-0001, IT-0002...
  nome        text not null,
  categoria   text not null check (categoria in ('Notebook','Desktop','Servidor','Monitor','Periférico','Outro')),
  fabricante  text,
  serie       text,
  usuario_resp text,
  localizacao text not null check (localizacao in ('Sede SP','Campinas','Home Office','Data Center','Outro')),
  status      text not null default 'ok' check (status in ('ok','warn','err')),
  data_aquisicao date,
  valor       numeric(12,2),
  garantia_ate date,
  observacoes text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- TABELA: histórico de eventos
-- ============================================================
create table public.historico (
  id          uuid primary key default uuid_generate_v4(),
  ativo_id    uuid references public.ativos(id) on delete cascade,
  ativo_codigo text not null,
  ativo_nome  text not null,
  tipo        text not null check (tipo in ('Cadastro','Movimentação','Manutenção','Atualização','Descarte')),
  descricao   text not null,
  responsavel text not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

-- ============================================================
-- TABELA: licenças
-- ============================================================
create table public.licencas (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  fabricante  text,
  total       integer not null default 0,
  usadas      integer not null default 0,
  renovacao   date,
  created_at  timestamptz default now()
);

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.ativos
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FUNÇÃO: criar profile automaticamente ao registrar usuário
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'auditor')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.ativos    enable row level security;
alter table public.historico enable row level security;
alter table public.licencas  enable row level security;

-- Profiles: cada user vê o próprio; admin vê todos
create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

create policy "profiles_update_admin" on public.profiles for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Ativos: todos autenticados lêem; só admin/tecnico criam/editam
create policy "ativos_select" on public.ativos for select using (auth.role() = 'authenticated');
create policy "ativos_insert" on public.ativos for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','tecnico')));
create policy "ativos_update" on public.ativos for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','tecnico')));
create policy "ativos_delete" on public.ativos for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Histórico: todos lêem; admin/tecnico inserem
create policy "historico_select" on public.historico for select using (auth.role() = 'authenticated');
create policy "historico_insert" on public.historico for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','tecnico')));

-- Licenças: todos lêem; só admin edita
create policy "licencas_select" on public.licencas for select using (auth.role() = 'authenticated');
create policy "licencas_all_admin" on public.licencas for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- DADOS INICIAIS DE EXEMPLO
-- ============================================================
insert into public.licencas (nome, fabricante, total, usadas, renovacao) values
  ('Microsoft 365',      'Microsoft', 500,  495,  '2026-07-04'),
  ('Adobe Creative Cloud','Adobe',    120,  118,  '2026-07-18'),
  ('AutoCAD 2024',        'Autodesk', 60,   45,   '2026-09-01'),
  ('Slack Business+',     'Slack',    1000, 890,  '2026-12-01'),
  ('Antivírus Corporativo','Diversos',2500, 2480, '2026-11-15');
