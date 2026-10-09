"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Search, X } from "lucide-react";
import { api, caminhoDaConversa } from "./api";
import { Avatar } from "./Avatar";
import { Balao } from "./Balao";
import { Composer } from "./Composer";
import { chaveDoDia, separadorDoDia } from "./formato";
import { comPendentes, mesclarMensagens, recebidasNaoMarcadas, type Pendente } from "./mesclar";
import { usePeriodico } from "./usePeriodico";
import type { Chat, Mensagem } from "./tipos";

type Pagina = { mensagens: Mensagem[]; temMais: boolean };
type Envio = { enviado: boolean; id?: string; detalhe?: string; erro?: string };

let contadorTemp = 0;

/**
 * O painel da direita: cabeçalho, mensagens e a barra de digitar.
 *
 * Mensagem nova chega por consulta a cada 3s (a página 1 é mesclada com o que
 * já está na tela). Rolar até o topo traz a página anterior. A mensagem
 * enviada aparece na hora com o relógio e troca para ✓ quando o WhatsApp
 * confirma — nunca antes.
 */
export function Conversa({
  chat,
  aoVoltar,
  aoLer,
  aoEnviar,
}: {
  chat: Chat;
  aoVoltar: () => void;
  aoLer: (jid: string) => void;
  aoEnviar: (jid: string, previa: string) => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState<Mensagem | null>(null);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const [noFim, setNoFim] = useState(true);
  const [busca, setBusca] = useState<string | null>(null);

  const rolagem = useRef<HTMLDivElement>(null);
  const marcadas = useRef(new Set<string>());
  const alturaAntes = useRef<number | null>(null);
  const grudarNoFim = useRef(true);

  const caminho = caminhoDaConversa(chat.jid);

  const buscarRecentes = useCallback(async () => {
    try {
      const r = await api<Pagina>(`${caminho}/mensagens?pagina=1`);
      setMensagens((atual) => mesclarMensagens(atual, r.mensagens));
      setTemMais((v) => (pagina === 1 ? r.temMais : v));
      setErro(null);
      setCarregou(true);

      // Abrir a conversa no app marca as recebidas como lidas (✓✓ azul do outro lado).
      if (document.visibilityState === "visible") {
        const ids = recebidasNaoMarcadas(r.mensagens, marcadas.current);
        if (ids.length) {
          ids.forEach((id) => marcadas.current.add(id));
          void fetch(`${caminho}/lidas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
          aoLer(chat.jid);
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCarregou(true);
    }
  }, [caminho, chat.jid, aoLer, pagina]);

  usePeriodico(buscarRecentes, 3_000);

  async function carregarAntigas() {
    if (carregandoAntigas || !temMais) return;
    setCarregandoAntigas(true);
    alturaAntes.current = rolagem.current?.scrollHeight ?? null;
    try {
      const proxima = pagina + 1;
      const r = await api<Pagina>(`${caminho}/mensagens?pagina=${proxima}`);
      setMensagens((atual) => mesclarMensagens(atual, r.mensagens));
      setPagina(proxima);
      setTemMais(r.temMais && r.mensagens.length > 0);
    } catch {
      alturaAntes.current = null;
    }
    setCarregandoAntigas(false);
  }

  const visiveis = comPendentes(mensagens, pendentes);
  const filtradas = busca?.trim()
    ? visiveis.filter((m) => (m.texto ?? "").toLowerCase().includes(busca.trim().toLowerCase()))
    : visiveis;

  // Mantém a posição ao carregar as antigas; gruda no fim quando chega mensagem nova.
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    if (alturaAntes.current !== null) {
      el.scrollTop = el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
      return;
    }
    if (grudarNoFim.current) el.scrollTop = el.scrollHeight;
  }, [visiveis.length]);

  function aoRolar() {
    const el = rolagem.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    grudarNoFim.current = perto;
    setNoFim(perto);
    if (el.scrollTop < 200) void carregarAntigas();
  }

  function irParaOFim() {
    const el = rolagem.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  function novaPendente(parcial: Partial<Mensagem>): Pendente {
    return {
      id: `temp-${++contadorTemp}`,
      jid: chat.jid,
      deMim: true,
      em: new Date().toISOString(),
      tipo: "texto",
      texto: null,
      nomeArquivo: null,
      mimetype: null,
      duracao: null,
      miniatura: null,
      status: "pendente",
      autor: null,
      autorJid: null,
      citada: respondendo ? { autor: respondendo.deMim ? "Você" : respondendo.autor, texto: respondendo.texto ?? "Mídia" } : null,
      localizacao: null,
      reacoes: [],
      ...parcial,
    };
  }

  async function despachar(p: Pendente, requisicao: () => Promise<Response>, previa: string) {
    grudarNoFim.current = true;
    setPendentes((l) => [...l, p]);
    setRespondendo(null);
    try {
      const res = await requisicao();
      const r = (await res.json().catch(() => ({}))) as Envio;
      if (res.status === 401) window.location.href = "/entrar";
      if (r.enviado && r.id) {
        setPendentes((l) => l.map((x) => (x.id === p.id ? { ...x, status: "enviada", idReal: r.id } : x)));
        aoEnviar(chat.jid, previa);
        void buscarRecentes();
      } else {
        setPendentes((l) => l.map((x) => (x.id === p.id ? { ...x, status: "erro" } : x)));
        setErro(r.detalhe ?? r.erro ?? "A mensagem não foi enviada.");
      }
    } catch {
      setPendentes((l) => l.map((x) => (x.id === p.id ? { ...x, status: "erro" } : x)));
      setErro("Sem conexão: a mensagem não foi enviada.");
    }
  }

  function enviarTexto(texto: string) {
    const citarId = respondendo?.id ?? null;
    void despachar(
      novaPendente({ texto }),
      () =>
        fetch(`${caminho}/mensagens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto, citarId }),
        }),
      texto,
    );
  }

  function enviarArquivo(arquivo: File, legenda: string) {
    const tipo = arquivo.type.startsWith("image/")
      ? "imagem"
      : arquivo.type.startsWith("video/")
        ? "video"
        : arquivo.type.startsWith("audio/")
          ? "audio"
          : "documento";
    const form = new FormData();
    form.set("arquivo", arquivo);
    if (legenda) form.set("legenda", legenda);
    void despachar(
      novaPendente({ tipo: "documento", nomeArquivo: arquivo.name, texto: legenda || null, mimetype: arquivo.type }),
      () => fetch(`${caminho}/mensagens`, { method: "POST", body: form }),
      tipo === "imagem" ? "📷 Foto" : tipo === "video" ? "🎥 Vídeo" : `📄 ${arquivo.name}`,
    );
  }

  function enviarVoz(audio: Blob) {
    const form = new FormData();
    form.set("arquivo", new File([audio], "audio.ogg", { type: audio.type }));
    form.set("voz", "1");
    void despachar(
      novaPendente({ tipo: "documento", nomeArquivo: "Mensagem de voz", mimetype: audio.type }),
      () => fetch(`${caminho}/mensagens`, { method: "POST", body: form }),
      "🎤 Áudio",
    );
  }

  useEffect(() => {
    if (!imagemAberta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setImagemAberta(null);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [imagemAberta]);

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col" aria-label={`Conversa com ${chat.nome}`}>
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-l border-wa-divisor bg-wa-barra px-2 sm:px-4">
        <button type="button" onClick={aoVoltar} className="grid size-11 place-items-center rounded-full text-wa-secundario md:hidden" aria-label="Voltar para as conversas">
          <ArrowLeft className="size-6" />
        </button>
        <Avatar jid={chat.jid} nome={chat.nome} foto={chat.foto} grupo={chat.grupo} tamanho={40} />
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-[16px]">{chat.nome}</p>
          <p className="truncate text-[13px] text-wa-meta">{chat.grupo ? "Grupo" : chat.telefone ?? ""}</p>
        </div>
        {busca === null ? (
          <button type="button" onClick={() => setBusca("")} className="grid size-11 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover" aria-label="Pesquisar na conversa">
            <Search className="size-5" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar…"
              aria-label="Pesquisar na conversa"
              className="h-9 w-32 rounded-lg bg-wa-campo px-3 text-sm outline-none sm:w-56"
            />
            <button type="button" onClick={() => setBusca(null)} className="grid size-11 place-items-center rounded-full text-wa-secundario" aria-label="Fechar pesquisa">
              <X className="size-5" />
            </button>
          </div>
        )}
      </header>

      <div ref={rolagem} onScroll={aoRolar} className="wa-papel wa-rolagem relative flex-1 overflow-y-auto pb-4">
        {carregandoAntigas && <p className="py-3 text-center text-xs text-wa-meta">Carregando mensagens anteriores…</p>}
        {!carregou && <p className="py-10 text-center text-sm text-wa-meta">Carregando mensagens…</p>}
        {carregou && visiveis.length === 0 && !erro && (
          <p className="mx-auto mt-10 max-w-sm rounded-lg bg-wa-dia px-4 py-3 text-center text-sm text-wa-meta shadow-sm">
            Nenhuma mensagem guardada nesta conversa ainda. As novas aparecem aqui assim que chegarem.
          </p>
        )}
        {filtradas.map((m, i) => {
          const anterior = filtradas[i - 1];
          const novoDia = !anterior || chaveDoDia(anterior.em) !== chaveDoDia(m.em);
          const primeiro =
            novoDia || !anterior || anterior.deMim !== m.deMim || (chat.grupo && anterior.autorJid !== m.autorJid);
          return (
            <Fragment key={m.id}>
              {novoDia && (
                <div className="sticky top-2 z-10 my-3 flex justify-center">
                  <span className="rounded-lg bg-wa-dia px-3 py-1.5 text-[12.5px] text-wa-meta shadow-sm">{separadorDoDia(m.em)}</span>
                </div>
              )}
              <Balao
                m={m}
                primeiroDaSequencia={primeiro}
                mostrarAutor={chat.grupo && primeiro && !m.deMim}
                aoResponder={setRespondendo}
                aoAbrirImagem={setImagemAberta}
              />
            </Fragment>
          );
        })}
      </div>

      {!noFim && (
        <button
          type="button"
          onClick={irParaOFim}
          className="absolute bottom-24 right-6 grid size-11 place-items-center rounded-full bg-wa-entrada text-wa-secundario shadow-md"
          aria-label="Ir para a mensagem mais recente"
        >
          <ChevronDown className="size-6" />
        </button>
      )}

      {erro && (
        <p role="alert" className="flex items-center justify-between gap-2 bg-wa-perigo/10 px-4 py-2 text-sm text-wa-perigo">
          {erro}
          <button type="button" onClick={() => setErro(null)} className="grid size-8 place-items-center" aria-label="Fechar aviso">
            <X className="size-4" />
          </button>
        </p>
      )}

      <Composer
        key={chat.jid}
        respondendo={respondendo}
        aoCancelarResposta={() => setRespondendo(null)}
        aoEnviarTexto={enviarTexto}
        aoEnviarArquivo={enviarArquivo}
        aoEnviarVoz={enviarVoz}
        aoDigitar={() => void fetch(`${caminho}/digitando`, { method: "POST" })}
      />

      {imagemAberta && (
        <div role="dialog" aria-label="Foto" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setImagemAberta(null)}>
          <button type="button" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full text-white" aria-label="Fechar">
            <X className="size-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- mídia decifrada sob demanda */}
          <img src={imagemAberta} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </section>
  );
}
