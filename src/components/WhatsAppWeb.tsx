"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, LogOut, MessageSquarePlus, MoreVertical, Search, Smartphone, X } from "lucide-react";
import { api } from "./api";
import { Avatar } from "./Avatar";
import { Conversa } from "./Conversa";
import { quandoNaLista } from "./formato";
import { Ticks } from "./Ticks";
import { usePeriodico } from "./usePeriodico";
import { jidDoTelefone } from "@/lib/evolution/jid";
import type { Chat } from "./tipos";

type Filtro = "todas" | "nao_lidas" | "grupos";

/**
 * As duas colunas do WhatsApp Web: conversas à esquerda, chat à direita.
 * No celular, uma de cada vez (a conversa aberta cobre a lista).
 * A lista é consultada a cada 5s.
 */
export function WhatsAppWeb({
  perfil,
  aoDesconectar,
}: {
  perfil: { nome: string | null; foto: string | null; telefone: string | null };
  aoDesconectar: () => void;
}) {
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [extra, setExtra] = useState<Chat | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [menu, setMenu] = useState(false);
  const [novaConversa, setNovaConversa] = useState(false);
  const [numeroNovo, setNumeroNovo] = useState("");
  const [desconectando, setDesconectando] = useState(false);
  const lidosLocal = useRef(new Set<string>());

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ conversas: Chat[] }>("/api/conversas");
      setChats(
        r.conversas.map((c) => (lidosLocal.current.has(c.jid) ? { ...c, naoLidas: 0 } : c)),
      );
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setChats((c) => c ?? []);
    }
  }, []);

  usePeriodico(carregar, 5_000);

  // Título da aba com o total de não lidas, como o app: "(3) WhatsApp".
  const totalNaoLidas = (chats ?? []).reduce((s, c) => s + (c.naoLidas > 0 ? 1 : 0), 0);
  useEffect(() => {
    document.title = totalNaoLidas ? `(${totalNaoLidas}) WhatsApp` : "WhatsApp";
  }, [totalNaoLidas]);

  const aoLer = useCallback((jid: string) => {
    lidosLocal.current.add(jid);
    setChats((l) => l?.map((c) => (c.jid === jid ? { ...c, naoLidas: 0 } : c)) ?? l);
    // A marca local vale até a próxima lista do servidor já trazer zero.
    setTimeout(() => lidosLocal.current.delete(jid), 15_000);
  }, []);

  const aoEnviar = useCallback((jid: string, previa: string) => {
    setChats((l) => {
      if (!l) return l;
      const agora = new Date().toISOString();
      const existente = l.find((c) => c.jid === jid);
      const atualizado: Chat | null = existente
        ? { ...existente, em: agora, ultima: { texto: previa, deMim: true, status: "enviada", tipo: "texto" } }
        : null;
      return atualizado ? [atualizado, ...l.filter((c) => c.jid !== jid)] : l;
    });
  }, []);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return (chats ?? []).filter((c) => {
      if (filtro === "nao_lidas" && c.naoLidas === 0) return false;
      if (filtro === "grupos" && !c.grupo) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        (digitos.length >= 3 && c.jid.includes(digitos)) ||
        (c.ultima?.texto ?? "").toLowerCase().includes(q)
      );
    });
  }, [chats, busca, filtro]);

  const chatAberto = (chats ?? []).find((c) => c.jid === aberto) ?? (extra?.jid === aberto ? extra : null);

  function abrirNumero(e: React.FormEvent) {
    e.preventDefault();
    const jid = jidDoTelefone(numeroNovo);
    if (!jid) return;
    const existente = (chats ?? []).find((c) => c.jid === jid);
    if (!existente) {
      const d = jid.split("@")[0];
      setExtra({
        jid,
        nome: `+${d}`,
        telefone: `+${d}`,
        grupo: false,
        foto: null,
        naoLidas: 0,
        em: null,
        ultima: null,
      });
    }
    setAberto(jid);
    setNovaConversa(false);
    setNumeroNovo("");
  }

  async function desconectar() {
    if (!window.confirm("Desconectar este WhatsApp? Para voltar, será preciso ler o QR Code de novo.")) return;
    setDesconectando(true);
    try {
      await api("/api/conexao", { method: "DELETE" });
      aoDesconectar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
    setDesconectando(false);
  }

  async function sair() {
    await fetch("/api/sessao", { method: "DELETE" });
    window.location.href = "/entrar";
  }

  return (
    <div className="flex h-dvh justify-center bg-wa-app xl:py-[19px]">
      <div className="flex h-full w-full max-w-[1600px] overflow-hidden bg-wa-lista shadow-lg">
        {/* Coluna das conversas */}
        <aside
          className={`flex h-full w-full flex-col border-r border-wa-divisor md:w-[40%] md:max-w-[480px] md:min-w-[320px] ${
            aberto ? "hidden md:flex" : "flex"
          }`}
          aria-label="Conversas"
        >
          <header className="flex h-[60px] shrink-0 items-center justify-between bg-wa-barra px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar nome={perfil.nome ?? "Eu"} foto={perfil.foto} tamanho={40} />
              <span className="truncate text-sm text-wa-secundario">{perfil.nome ?? perfil.telefone ?? ""}</span>
            </div>
            <div className="relative flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNovaConversa((v) => !v)}
                className="grid size-11 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover"
                aria-label="Nova conversa"
                title="Nova conversa"
              >
                <MessageSquarePlus className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => setMenu((v) => !v)}
                className="grid size-11 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover"
                aria-label="Mais opções"
                aria-expanded={menu}
              >
                <MoreVertical className="size-6" />
              </button>
              {menu && (
                <div className="absolute right-0 top-12 z-30 w-56 rounded-md bg-wa-entrada py-2 shadow-lg" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={desconectando}
                    onClick={() => {
                      setMenu(false);
                      void desconectar();
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-5 text-left text-[15px] hover:bg-wa-hover"
                  >
                    <Smartphone className="size-4 text-wa-meta" aria-hidden /> Desconectar WhatsApp
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void sair()}
                    className="flex min-h-11 w-full items-center gap-3 px-5 text-left text-[15px] hover:bg-wa-hover"
                  >
                    <LogOut className="size-4 text-wa-meta" aria-hidden /> Sair deste navegador
                  </button>
                </div>
              )}
            </div>
          </header>

          {novaConversa && (
            <form onSubmit={abrirNumero} className="flex items-center gap-2 border-b border-wa-divisor px-3 py-2">
              <input
                autoFocus
                inputMode="tel"
                value={numeroNovo}
                onChange={(e) => setNumeroNovo(e.target.value)}
                placeholder="Número com DDD"
                aria-label="Número para iniciar conversa"
                className="h-10 flex-1 rounded-lg bg-wa-busca px-3 text-sm outline-none"
              />
              <button type="submit" disabled={!jidDoTelefone(numeroNovo)} className="h-10 rounded-full bg-wa-botao px-4 text-sm font-medium text-white disabled:opacity-50">
                Conversar
              </button>
              <button type="button" onClick={() => setNovaConversa(false)} className="grid size-10 place-items-center text-wa-secundario" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </form>
          )}

          <div className="shrink-0 px-3 py-2">
            <label className="flex h-9 items-center gap-4 rounded-lg bg-wa-busca px-4 text-wa-meta">
              <Search className="size-4 shrink-0" aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                aria-label="Pesquisar conversas"
                className="min-w-0 flex-1 bg-transparent text-sm text-wa-texto outline-none placeholder:text-wa-meta"
              />
              {busca && (
                <button type="button" onClick={() => setBusca("")} aria-label="Limpar pesquisa" className="grid size-6 place-items-center">
                  <X className="size-4" />
                </button>
              )}
            </label>
            <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar conversas">
              {(
                [
                  ["todas", "Tudo"],
                  ["nao_lidas", "Não lidas"],
                  ["grupos", "Grupos"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={`h-8 rounded-full px-3 text-sm transition ${
                    filtro === valor ? "bg-[#d9fdd3] text-[#008069] dark:bg-[#0a332c] dark:text-[#00a884]" : "bg-wa-busca text-wa-secundario hover:bg-wa-hover"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          <ul className="wa-rolagem min-h-0 flex-1 overflow-y-auto" aria-label="Lista de conversas">
            {chats === null && <li className="p-6 text-center text-sm text-wa-meta">Carregando conversas…</li>}
            {erro && (
              <li role="alert" className="m-3 rounded-md bg-wa-perigo/10 p-3 text-sm text-wa-perigo">
                Não foi possível carregar as conversas: {erro}
              </li>
            )}
            {chats !== null && chats.length === 0 && !erro && (
              <li className="m-4 rounded-md bg-wa-busca p-4 text-sm leading-relaxed text-wa-secundario">
                Nenhuma conversa guardada ainda. Logo depois de conectar, o celular envia o histórico e ele aparece aqui
                em alguns minutos. Se continuar vazio, o servidor da Evolution precisa estar com o armazenamento de
                mensagens ligado (<code>DATABASE_SAVE_DATA_*</code> — veja o README).
              </li>
            )}
            {chats !== null && chats.length > 0 && lista.length === 0 && (
              <li className="p-6 text-center text-sm text-wa-meta">Nenhuma conversa encontrada.</li>
            )}
            {lista.map((c) => (
              <li key={c.jid}>
                <button
                  type="button"
                  onClick={() => {
                    setAberto(c.jid);
                    setMenu(false);
                  }}
                  aria-current={aberto === c.jid ? "true" : undefined}
                  className={`flex w-full items-center gap-3 pl-3 text-left ${aberto === c.jid ? "bg-wa-ativa" : "hover:bg-wa-hover"}`}
                >
                  <Avatar jid={c.jid} nome={c.nome} foto={c.foto} grupo={c.grupo} />
                  <span className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center border-b border-wa-divisor pr-4">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[17px]">{c.nome}</span>
                      <span className={`shrink-0 text-xs ${c.naoLidas ? "text-wa-badge" : "text-wa-meta"}`}>{quandoNaLista(c.em)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-wa-meta">
                        {c.ultima?.deMim && <Ticks status={c.ultima.status} />}
                        <span className="truncate">{c.ultima?.texto ?? ""}</span>
                      </span>
                      {c.naoLidas > 0 && (
                        <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-wa-badge px-1.5 text-xs font-medium text-white dark:text-[#111b21]">
                          {c.naoLidas}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Coluna do chat */}
        <main className={`h-full min-w-0 flex-1 ${aberto ? "flex" : "hidden md:flex"}`}>
          {chatAberto ? (
            <Conversa key={chatAberto.jid} chat={chatAberto} aoVoltar={() => setAberto(null)} aoLer={aoLer} aoEnviar={aoEnviar} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center border-b-[6px] border-wa-botao bg-wa-barra px-10 text-center">
              <svg viewBox="0 0 24 24" className="size-20 text-wa-meta/40" fill="currentColor" aria-hidden>
                <path d="M4 5h16v11H7l-3 3V5Zm2 2v7.17L6.17 14H18V7H6Z" />
              </svg>
              <h1 className="mt-6 text-[32px] font-light text-wa-texto">WhatsApp Web</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-wa-meta">
                Envie e receba mensagens sem precisar manter seu celular conectado. Escolha uma conversa à esquerda para
                começar.
              </p>
              <p className="mt-10 flex items-center gap-1 text-xs text-wa-meta">
                <Lock className="size-3" aria-hidden /> Suas mensagens pessoais são protegidas com a criptografia de ponta a ponta.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
