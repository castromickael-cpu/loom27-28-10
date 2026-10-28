-- =====================================================================
--  LOOM — esquema do banco (Supabase / PostgreSQL)
--  Cole tudo no SQL Editor do Supabase e execute uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

-- Perfil público de cada aluno (1 para 1 com auth.users).
-- E-mail e senha ficam em auth.users (nunca expostos aqui).
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  nome           text not null check (char_length(trim(nome)) between 2 and 80),
  curso          text not null check (curso in ('DS','ADM','PRT','BIO')),
  ano            smallint not null check (ano between 1 and 3),
  bio            text not null default '' check (char_length(bio) <= 300),
  avatar_url     text,
  banner_url     text,
  verificado     boolean not null default false,
  is_admin       boolean not null default false,
  mostrar_online boolean not null default true,
  mostrar_views  boolean not null default true,
  ultimo_acesso  timestamptz,
  created_at     timestamptz not null default now()
);

-- Preferências privadas (só o dono lê/edita).
create table public.preferencias (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  modo              text not null default 'light' check (modo in ('light','dark')),
  tema              text not null default 'padrao' check (tema in ('padrao','rosa','verde','roxo','solar')),
  fonte             smallint not null default 15 check (fonte between 10 and 24),
  notif_seguidores  boolean not null default true,
  notif_feed        boolean not null default true
);

-- Links do perfil (máx. 6 por aluno, ordem preservada).
create table public.links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  url        text not null check (url ~* '^https?://' and char_length(url) <= 500),
  posicao    smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

-- Quem segue quem (relação N:N entre perfis).
create table public.follows (
  seguidor_id uuid not null references public.profiles(id) on delete cascade,
  seguido_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (seguidor_id, seguido_id),
  check (seguidor_id <> seguido_id)
);

-- Postagens do feed.
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null references public.profiles(id) on delete cascade,
  texto       text not null default '' check (char_length(texto) <= 2000),
  imagem_path text,                                   -- caminho no bucket "posts"
  created_at  timestamptz not null default now(),
  check (texto <> '' or imagem_path is not null)
);

-- Curtidas (1 por aluno por post).
create table public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Comentários e respostas (parent_id = comentário de topo; mencao = @usuario respondido).
create table public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  autor_id   uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.comentarios(id) on delete cascade,
  mencao     text,
  texto      text not null check (char_length(trim(texto)) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- Visitas ao perfil: 1 registro por visitante por dia (evita inflar o contador).
create table public.visitas (
  perfil_id    uuid not null references public.profiles(id) on delete cascade,
  visitante_id uuid not null references public.profiles(id) on delete cascade,
  dia          date not null,
  primary key (perfil_id, visitante_id, dia)
);

-- Códigos de verificação gerados pelo administrador (ninguém lê direto).
create table public.verificacoes (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  codigo     text not null,
  gerado_por uuid references public.profiles(id) on delete set null,
  gerado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default (now() + interval '7 days'),
  tentativas smallint not null default 0
);

-- Avisos e eventos da tela inicial (escritos por admins).
create table public.avisos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null default 'geral' check (tipo in ('urgente','evento','info','geral')),
  titulo     text not null,
  descricao  text not null default '',
  data_texto text,                                    -- ex.: "até 06/06/2026"
  expira_em  date,                                    -- some do app depois dessa data
  created_at timestamptz not null default now()
);

create table public.eventos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null default 'evento' check (tipo in ('prova','trabalho','apresentacao','evento')),
  titulo     text not null,
  descricao  text not null default '',
  data       date not null,
  created_at timestamptz not null default now()
);

-- Índices
create index on public.links (user_id, posicao);
create index on public.follows (seguido_id);
create index on public.posts (autor_id);
create index on public.posts (created_at desc);
create index on public.post_likes (user_id);
create index on public.comentarios (post_id, created_at);
create index on public.comentarios (parent_id);
create index on public.visitas (perfil_id);
create index on public.eventos (data);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.esta_verificado()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.verificado from public.profiles p where p.id = auth.uid()), false);
$$;

-- Cria profile + preferências automaticamente quando alguém se cadastra.
-- Os dados vêm de signUp({ options: { data: { username, nome, curso, ano } } }).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, username, nome, curso, ano)
  values (new.id,
          lower(trim(m->>'username')),
          trim(m->>'nome'),
          upper(trim(m->>'curso')),
          (m->>'ano')::smallint);
  insert into public.preferencias (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Limita a 6 links por aluno.
create or replace function public.limitar_links()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.links where user_id = new.user_id) >= 6 then
    raise exception 'Máximo de 6 links por perfil.';
  end if;
  return new;
end $$;

create trigger trg_limitar_links
  before insert on public.links
  for each row execute function public.limitar_links();

-- ---------------------------------------------------------------------
-- 3. VIEW com contadores (seguidores, seguindo, posts, visitas)
--    Roda com os privilégios do dono para poder contar a tabela "visitas".
--    Só expõe campos públicos (sem e-mail).
-- ---------------------------------------------------------------------
create or replace view public.v_perfis as
select
  p.id, p.username, p.nome, p.curso, p.ano, p.bio, p.avatar_url, p.banner_url,
  p.verificado, p.is_admin, p.mostrar_online, p.mostrar_views, p.ultimo_acesso, p.created_at,
  (select count(*) from public.follows f where f.seguido_id  = p.id)::int as seguidores,
  (select count(*) from public.follows f where f.seguidor_id = p.id)::int as seguindo,
  (select count(*) from public.posts   x where x.autor_id    = p.id)::int as posts,
  case when p.mostrar_views or p.id = auth.uid()
       then (select count(*) from public.visitas v where v.perfil_id = p.id)::int
  end as views                                   -- null quando o aluno oculta as visitas
from public.profiles p;

-- ---------------------------------------------------------------------
-- 4. FUNÇÕES (RPC) chamadas pelo front end
-- ---------------------------------------------------------------------

-- Usuário livre? (pode ser chamada antes do login, na tela de cadastro)
create or replace function public.username_disponivel(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where username = lower(trim(p_username)));
$$;

-- Registra visita (1 por visitante/dia; ignora o próprio perfil).
create or replace function public.registrar_visita(p_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then return; end if;
  select id into v_id from public.profiles where username = lower(trim(p_username));
  if v_id is null or v_id = auth.uid() then return; end if;
  insert into public.visitas (perfil_id, visitante_id, dia)
  values (v_id, auth.uid(), (now() at time zone 'America/Sao_Paulo')::date)
  on conflict do nothing;
end $$;

-- Substitui todos os links do aluno de uma vez (atômico, respeita RLS).
create or replace function public.salvar_links(p_urls text[])
returns void language plpgsql as $$
begin
  delete from public.links where user_id = auth.uid();
  insert into public.links (user_id, url, posicao)
  select auth.uid(), t.url, t.pos::smallint
  from unnest(p_urls) with ordinality as t(url, pos)
  order by t.pos
  limit 6;
end $$;

-- ADMIN: lista cadastros pendentes (com e-mail).
create or replace function public.admin_pendentes()
returns table (id uuid, username text, nome text, email text, curso text, ano smallint,
               created_at timestamptz, codigo_gerado boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
    select p.id, p.username, p.nome, u.email::text, p.curso, p.ano, p.created_at,
           exists (select 1 from public.verificacoes v where v.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    where not p.verificado
    order by p.created_at;
end $$;

-- ADMIN: gera (ou renova) o código de 6 dígitos de um aluno.
create or replace function public.gerar_codigo(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ok boolean; v_cod text;
begin
  if not public.is_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select p.id, p.verificado into v_id, v_ok
  from public.profiles p where p.username = lower(trim(p_username));
  if v_id is null then raise exception 'Usuário não encontrado.'; end if;
  if v_ok then raise exception 'Essa conta já está verificada.'; end if;

  v_cod := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');

  insert into public.verificacoes (user_id, codigo, gerado_por, gerado_em, expira_em, tentativas)
  values (v_id, v_cod, auth.uid(), now(), now() + interval '7 days', 0)
  on conflict (user_id) do update
    set codigo = excluded.codigo, gerado_por = excluded.gerado_por,
        gerado_em = now(), expira_em = excluded.expira_em, tentativas = 0;
  return v_cod;
end $$;

-- ALUNO: confirma o código recebido por e-mail.
-- Retorna: 'ok' | 'invalido' | 'expirado' | 'bloqueado' | 'sem_codigo'
create or replace function public.confirmar_codigo(p_codigo text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.verificacoes;
begin
  if auth.uid() is null then return 'sem_codigo'; end if;
  select * into r from public.verificacoes where user_id = auth.uid() for update;
  if not found then return 'sem_codigo'; end if;
  if r.tentativas >= 5 then return 'bloqueado'; end if;
  if r.expira_em < now() then return 'expirado'; end if;
  if r.codigo <> trim(p_codigo) then
    update public.verificacoes set tentativas = tentativas + 1 where user_id = auth.uid();
    return 'invalido';
  end if;
  update public.profiles set verificado = true where id = auth.uid();
  delete from public.verificacoes where user_id = auth.uid();
  return 'ok';
end $$;

-- Permissões das funções
revoke all on function public.is_admin(), public.esta_verificado(), public.username_disponivel(text),
  public.registrar_visita(text), public.salvar_links(text[]), public.admin_pendentes(),
  public.gerar_codigo(text), public.confirmar_codigo(text), public.handle_new_user(),
  public.limitar_links() from public, anon, authenticated;

grant execute on function public.username_disponivel(text) to anon, authenticated;
grant execute on function public.is_admin(), public.esta_verificado(), public.registrar_visita(text),
  public.salvar_links(text[]), public.admin_pendentes(), public.gerar_codigo(text),
  public.confirmar_codigo(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. PERMISSÕES DAS TABELAS + RLS (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.preferencias enable row level security;
alter table public.links        enable row level security;
alter table public.follows      enable row level security;
alter table public.posts        enable row level security;
alter table public.post_likes   enable row level security;
alter table public.comentarios  enable row level security;
alter table public.visitas      enable row level security;
alter table public.verificacoes enable row level security;
alter table public.avisos       enable row level security;
alter table public.eventos      enable row level security;

revoke all on public.profiles, public.preferencias, public.links, public.follows, public.posts,
  public.post_likes, public.comentarios, public.visitas, public.verificacoes, public.avisos,
  public.eventos, public.v_perfis from anon, authenticated;

-- profiles: todos os logados leem; o dono edita APENAS colunas seguras
-- (verificado e is_admin só mudam por funções do servidor).
grant select on public.profiles to authenticated;
grant update (nome, curso, ano, bio, avatar_url, banner_url, mostrar_online, mostrar_views, ultimo_acesso)
  on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select on public.v_perfis to authenticated;

-- preferencias: só o dono
grant select, update on public.preferencias to authenticated;
create policy pref_select on public.preferencias for select to authenticated using (user_id = auth.uid());
create policy pref_update on public.preferencias for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- links
grant select, insert, delete on public.links to authenticated;
create policy links_select on public.links for select to authenticated using (true);
create policy links_insert on public.links for insert to authenticated with check (user_id = auth.uid());
create policy links_delete on public.links for delete to authenticated using (user_id = auth.uid());

-- follows
grant select, insert, delete on public.follows to authenticated;
create policy follows_select on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (seguidor_id = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (seguidor_id = auth.uid());

-- posts (só alunos verificados publicam; autor ou admin apaga)
grant select, insert, delete on public.posts to authenticated;
create policy posts_select on public.posts for select to authenticated using (true);
create policy posts_insert on public.posts for insert to authenticated
  with check (autor_id = auth.uid() and public.esta_verificado());
create policy posts_delete on public.posts for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());

-- curtidas
grant select, insert, delete on public.post_likes to authenticated;
create policy likes_select on public.post_likes for select to authenticated using (true);
create policy likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- comentários (só verificados comentam; autor ou admin apaga)
grant select, insert, delete on public.comentarios to authenticated;
create policy coment_select on public.comentarios for select to authenticated using (true);
create policy coment_insert on public.comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.esta_verificado());
create policy coment_delete on public.comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());

-- visitas e verificacoes: sem policy nenhuma = ninguém acessa direto (só via funções acima)

-- avisos / eventos: todos leem; só admin escreve
grant select, insert, update, delete on public.avisos, public.eventos to authenticated;
create policy avisos_select on public.avisos for select to authenticated using (true);
create policy avisos_admin  on public.avisos for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy eventos_select on public.eventos for select to authenticated using (true);
create policy eventos_admin  on public.eventos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. STORAGE (fotos de perfil, banners e imagens de posts)
--    Buckets públicos para leitura; cada aluno só escreve na pasta com o próprio id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('banners', 'banners', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('posts',   'posts',   true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy loom_storage_select on storage.objects for select to authenticated
  using (bucket_id in ('avatars','banners','posts'));
create policy loom_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','banners','posts') and (storage.foldername(name))[1] = auth.uid()::text);
create policy loom_storage_update on storage.objects for update to authenticated
  using (bucket_id in ('avatars','banners','posts') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('avatars','banners','posts') and (storage.foldername(name))[1] = auth.uid()::text);
create policy loom_storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','banners','posts')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 7. PRIMEIRO ADMINISTRADOR
--    Depois de criar sua conta pelo site, rode (troque pelo seu @usuario):
--
--    update public.profiles set is_admin = true, verificado = true where username = 'seuusuario';
--
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 8. (OPCIONAL) DADOS DE EXEMPLO PARA A TELA INICIAL
-- ---------------------------------------------------------------------
-- insert into public.avisos (tipo, titulo, descricao, data_texto, expira_em) values
--  ('urgente','Entrega de documentos pendentes','Alunos com documentação incompleta devem regularizar na secretaria.','até sexta-feira', current_date + 7),
--  ('evento','Semana da Tecnologia','Apresentação de projetos escolares aberta à comunidade.','em breve', current_date + 30);
-- insert into public.eventos (tipo, titulo, descricao, data) values
--  ('prova','Prova de Matemática','Funções, geometria e probabilidade.', current_date + 5),
--  ('trabalho','Entrega — Projeto de TI','Entrega final do projeto semestral.', current_date + 10);
