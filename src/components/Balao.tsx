"use client";

import { useState } from "react";
import { Ban, CornerUpLeft, Download, FileText, MapPin, UserRound, BarChart3 } from "lucide-react";
import { duracao, hora } from "./formato";
import { TextoFormatado } from "./TextoFormatado";
import { Ticks } from "./Ticks";
import type { Mensagem } from "./tipos";

export function urlDaMidia(m: Mensagem, baixar = false): string {
  const p = new URLSearchParams({ jid: m.jid, id: m.id, deMim: m.deMim ? "1" : "0" });
  if (baixar) {
    p.set("baixar", "1");
    if (m.nomeArquivo) p.set("nome", m.nomeArquivo);
  }
  return `/api/midia?${p}`;
}

function miniatura(m: Mensagem): string | undefined {
  return m.miniatura ? `data:image/jpeg;base64,${m.miniatura}` : undefined;
}

/** Hora + ticks, no canto do balão, como no app. */
function Rodape({ m, sobreMidia = false }: { m: Mensagem; sobreMidia?: boolean }) {
  return (
    <span
      className={`ml-2 inline-flex translate-y-1 items-center gap-0.5 whitespace-nowrap align-bottom text-[11px] ${
        sobreMidia ? "rounded-full bg-black/35 px-1.5 text-white" : "float-right text-wa-meta"
      }`}
    >
      {hora(m.em)}
      {m.deMim && <Ticks status={m.status} className={sobreMidia && m.status !== "lida" ? "!text-white" : ""} />}
    </span>
  );
}

function Midia({ m, aoAbrirImagem }: { m: Mensagem; aoAbrirImagem: (url: string) => void }) {
  const [falhou, setFalhou] = useState(false);
  const indisponivel = (
    <div className="flex h-24 w-64 max-w-full items-center justify-center rounded-md bg-black/10 px-3 text-center text-xs text-wa-meta">
      Mídia indisponível neste servidor. Veja no celular.
    </div>
  );

  switch (m.tipo) {
    case "imagem":
      if (falhou) return indisponivel;
      return (
        <button type="button" onClick={() => aoAbrirImagem(urlDaMidia(m))} className="block overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element -- mídia decifrada sob demanda pela rota /api/midia */}
          <img
            src={urlDaMidia(m)}
            alt={m.texto ?? "Foto"}
            loading="lazy"
            onError={() => setFalhou(true)}
            className="max-h-[330px] min-h-24 w-auto max-w-[min(330px,100%)] bg-cover bg-center object-cover"
            style={miniatura(m) ? { backgroundImage: `url(${miniatura(m)})` } : undefined}
          />
        </button>
      );
    case "figurinha":
      if (falhou) return indisponivel;
      return (
        // eslint-disable-next-line @next/next/no-img-element -- figurinha webp decifrada sob demanda
        <img src={urlDaMidia(m)} alt="Figurinha" loading="lazy" onError={() => setFalhou(true)} className="size-36 object-contain" />
      );
    case "video":
      return (
        <video
          controls
          preload="none"
          poster={miniatura(m)}
          src={urlDaMidia(m)}
          className="max-h-[330px] w-[330px] max-w-full rounded-md bg-black"
        />
      );
    case "audio":
      return (
        <div className="flex min-w-60 items-center gap-2 py-1">
          <audio controls preload="none" src={urlDaMidia(m)} className="h-10 w-full max-w-72" />
          {m.duracao ? <span className="text-xs text-wa-meta">{duracao(m.duracao)}</span> : null}
        </div>
      );
    case "documento":
      return (
        <a
          href={urlDaMidia(m, true)}
          className="flex min-w-60 max-w-full items-center gap-3 rounded-md bg-wa-citacao p-3"
          download={m.nomeArquivo ?? undefined}
        >
          <FileText className="size-8 shrink-0 text-wa-perigo" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{m.nomeArquivo ?? "Documento"}</span>
            <span className="text-xs uppercase text-wa-meta">{m.mimetype?.split("/")[1] ?? "arquivo"}</span>
          </span>
          <Download className="size-5 shrink-0 text-wa-meta" aria-label="Baixar" />
        </a>
      );
    default:
      return null;
  }
}

export function Balao({
  m,
  primeiroDaSequencia,
  mostrarAutor,
  aoResponder,
  aoAbrirImagem,
}: {
  m: Mensagem;
  primeiroDaSequencia: boolean;
  mostrarAutor: boolean;
  aoResponder: (m: Mensagem) => void;
  aoAbrirImagem: (url: string) => void;
}) {
  const ehMidia = ["imagem", "video", "figurinha"].includes(m.tipo);
  const semBalao = m.tipo === "figurinha";
  const lado = m.deMim ? "justify-end" : "justify-start";
  const cor = m.deMim ? "bg-wa-saida" : "bg-wa-entrada";
  const rabo = primeiroDaSequencia ? (m.deMim ? "rounded-tr-none" : "rounded-tl-none") : "";

  return (
    <div className={`group flex ${lado} ${primeiroDaSequencia ? "mt-3" : "mt-0.5"} px-[4%] sm:px-[7%]`}>
      <div className={`relative flex max-w-[85%] items-center gap-1 sm:max-w-[65%] ${m.deMim ? "flex-row-reverse" : ""}`}>
        <div
          className={`relative min-w-0 ${semBalao ? "" : `${cor} rounded-lg ${rabo} shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]`} ${
            ehMidia && !semBalao ? "p-1" : semBalao ? "" : "px-2 pb-1.5 pt-1.5"
          } wa-entra`}
        >
          {mostrarAutor && m.autor && !semBalao && (
            <p className={`truncate text-[12.8px] font-medium text-wa-nome ${ehMidia ? "px-1 pt-0.5" : ""}`}>{m.autor}</p>
          )}

          {m.citada && (
            <div className="mb-1 rounded-md border-l-4 border-wa-nome bg-wa-citacao px-2 py-1 text-[13px]">
              {m.citada.autor && <p className="font-medium text-wa-nome">{m.citada.autor}</p>}
              <p className="line-clamp-3 text-wa-secundario">{m.citada.texto}</p>
            </div>
          )}

          {m.tipo === "apagada" ? (
            <p className="flex items-center gap-1 text-[14.2px] italic text-wa-meta">
              <Ban className="size-4" aria-hidden />
              {m.deMim ? "Você apagou esta mensagem" : "Esta mensagem foi apagada"}
              <Rodape m={m} />
            </p>
          ) : m.tipo === "localizacao" ? (
            <a
              href={m.localizacao ? `https://maps.google.com/?q=${m.localizacao.lat},${m.localizacao.lng}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[14.2px]"
            >
              <MapPin className="size-6 text-wa-perigo" aria-hidden />
              <span>{m.texto ?? "Localização"}</span>
              <Rodape m={m} />
            </a>
          ) : m.tipo === "contato" || m.tipo === "enquete" ? (
            <p className="flex items-center gap-2 text-[14.2px]">
              {m.tipo === "contato" ? <UserRound className="size-6 text-wa-meta" aria-hidden /> : <BarChart3 className="size-6 text-wa-meta" aria-hidden />}
              {m.texto}
              <Rodape m={m} />
            </p>
          ) : m.tipo === "desconhecido" ? (
            <p className="text-[14.2px] italic text-wa-meta">
              Mensagem não suportada aqui — veja no celular.
              <Rodape m={m} />
            </p>
          ) : (
            <>
              <Midia m={m} aoAbrirImagem={aoAbrirImagem} />
              {m.texto ? (
                <p className={`whitespace-pre-wrap break-words text-[14.2px] leading-[19px] [overflow-wrap:anywhere] ${ehMidia ? "px-1 pt-1" : ""}`}>
                  <TextoFormatado texto={m.texto} />
                  <Rodape m={m} />
                </p>
              ) : ehMidia ? (
                <span className="absolute bottom-2 right-2">
                  <Rodape m={m} sobreMidia />
                </span>
              ) : (
                <p className="text-right">
                  <Rodape m={m} />
                </p>
              )}
            </>
          )}

          {m.reacoes.length > 0 && (
            <span className={`absolute -bottom-3 ${m.deMim ? "right-2" : "left-2"} rounded-full bg-wa-entrada px-1.5 text-sm shadow`}>
              {[...new Set(m.reacoes)].join("")}
              {m.reacoes.length > 1 ? <span className="ml-0.5 text-xs text-wa-meta">{m.reacoes.length}</span> : null}
            </span>
          )}
        </div>

        {m.tipo !== "apagada" && !m.id.startsWith("temp-") && (
          <button
            type="button"
            onClick={() => aoResponder(m)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-wa-meta opacity-0 transition hover:bg-black/5 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
            aria-label="Responder"
            title="Responder"
          >
            <CornerUpLeft className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
