-- whatsapp-web2: conversas, mensagens e contatos gravados pelo webhook da
-- Evolution. Só o servidor do app lê e escreve (chave secreta); a chave
-- pública não alcança nada aqui — por isso RLS ligada SEM policy nenhuma e
-- os grants do Supabase revogados (o padrão dá tudo a anon/authenticated).

create table if not exists public.wa_conversas (
  jid            text primary key,
  nome           text,
  foto           text,
  grupo          boolean not null default false,
  ultima_em      timestamptz,
  ultima_texto   text,
  ultima_de_mim  boolean,
  ultima_status  text,
  ultima_tipo    text,
  nao_lidas      integer not null default 0 check (nao_lidas >= 0),
  atualizado_em  timestamptz not null default now()
);
create index if not exists wa_conversas_ultima_em_idx on public.wa_conversas (ultima_em desc nulls last);

create table if not exists public.wa_mensagens (
  id            text primary key,              -- key.id do WhatsApp
  jid           text not null,
  de_mim        boolean not null,
  em            timestamptz not null,
  tipo          text not null,
  texto         text,
  nome_arquivo  text,
  mimetype      text,
  duracao       integer,
  miniatura     text,
  status        text,
  autor         text,
  autor_jid     text,
  citada        jsonb,
  localizacao   jsonb,
  reacoes       jsonb not null default '{}'::jsonb,  -- quem → emoji
  bruto         jsonb,                              -- key + message: é o que a Evolution precisa para decifrar a mídia
  criado_em     timestamptz not null default now()
);
create index if not exists wa_mensagens_jid_em_idx on public.wa_mensagens (jid, em desc);

create table if not exists public.wa_contatos (
  jid   text primary key,
  nome  text,
  foto  text,
  atualizado_em timestamptz not null default now()
);

alter table public.wa_conversas enable row level security;
alter table public.wa_mensagens enable row level security;
alter table public.wa_contatos  enable row level security;
revoke all on public.wa_conversas, public.wa_mensagens, public.wa_contatos from anon, authenticated;

-- Atualiza a "última mensagem" da conversa só quando a nova é mais recente,
-- e soma não lidas no mesmo comando (duas mensagens no mesmo instante não
-- perdem contagem). Recebe a conversa nova ou existente.
create or replace function public.wa_tocar_conversa(
  p_jid text, p_grupo boolean, p_em timestamptz, p_texto text, p_de_mim boolean,
  p_status text, p_tipo text, p_incrementar integer, p_nome text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into wa_conversas as c (jid, grupo, nome, ultima_em, ultima_texto, ultima_de_mim, ultima_status, ultima_tipo, nao_lidas)
  values (p_jid, p_grupo, p_nome, p_em, p_texto, p_de_mim, p_status, p_tipo, greatest(p_incrementar, 0))
  on conflict (jid) do update set
    nome          = coalesce(c.nome, excluded.nome),
    ultima_em     = case when c.ultima_em is null or excluded.ultima_em >= c.ultima_em then excluded.ultima_em     else c.ultima_em     end,
    ultima_texto  = case when c.ultima_em is null or excluded.ultima_em >= c.ultima_em then excluded.ultima_texto  else c.ultima_texto  end,
    ultima_de_mim = case when c.ultima_em is null or excluded.ultima_em >= c.ultima_em then excluded.ultima_de_mim else c.ultima_de_mim end,
    ultima_status = case when c.ultima_em is null or excluded.ultima_em >= c.ultima_em then excluded.ultima_status else c.ultima_status end,
    ultima_tipo   = case when c.ultima_em is null or excluded.ultima_em >= c.ultima_em then excluded.ultima_tipo   else c.ultima_tipo   end,
    nao_lidas     = c.nao_lidas + greatest(p_incrementar, 0),
    atualizado_em = now();
$$;

-- Reação: grava o emoji de quem reagiu na mensagem-alvo (vazio = removida).
create or replace function public.wa_reagir(p_id text, p_quem text, p_emoji text)
returns void
language sql
security definer
set search_path = public
as $$
  update wa_mensagens
     set reacoes = case when coalesce(p_emoji, '') = '' then reacoes - p_quem
                        else reacoes || jsonb_build_object(p_quem, p_emoji) end
   where id = p_id;
$$;

revoke all on function public.wa_tocar_conversa(text, boolean, timestamptz, text, boolean, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.wa_reagir(text, text, text) from public, anon, authenticated;
grant execute on function public.wa_tocar_conversa(text, boolean, timestamptz, text, boolean, text, text, integer, text) to service_role;
grant execute on function public.wa_reagir(text, text, text) to service_role;
