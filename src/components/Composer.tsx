"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, SendHorizontal, Smile, Square, Trash2, X } from "lucide-react";
import { duracao } from "./formato";
import type { Mensagem } from "./tipos";

const EMOJIS = "😀😂🥹😍😘😊😉😎🤔😅😭😡👍👏🙏💪🔥🎉❤️💚✅❌👀🙌🤝😴🤗😬🥳".match(/\p{Extended_Pictographic}️?/gu) ?? [];

/**
 * A barra de digitar do app: emoji, anexo, texto que cresce, e microfone
 * quando o campo está vazio. Enter envia; Shift+Enter quebra linha.
 */
export function Composer({
  respondendo,
  aoCancelarResposta,
  aoEnviarTexto,
  aoEnviarArquivo,
  aoEnviarVoz,
  aoDigitar,
}: {
  respondendo: Mensagem | null;
  aoCancelarResposta: () => void;
  aoEnviarTexto: (texto: string) => void;
  aoEnviarArquivo: (arquivo: File, legenda: string) => void;
  aoEnviarVoz: (audio: Blob) => void;
  aoDigitar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [emojis, setEmojis] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const descartar = useRef(false);
  const ultimoDigitando = useRef(0);

  useEffect(() => {
    if (respondendo) campo.current?.focus();
  }, [respondendo]);

  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [texto]);

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [gravando]);

  function enviar() {
    if (arquivo) {
      aoEnviarArquivo(arquivo, texto.trim());
      setArquivo(null);
      setTexto("");
      return;
    }
    const t = texto.trim();
    if (!t) return;
    aoEnviarTexto(t);
    setTexto("");
    setEmojis(false);
  }

  async function comecarGravacao() {
    setErro(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
      pedacos.current = [];
      descartar.current = false;
      rec.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data);
      rec.onstop = () => {
        fluxo.getTracks().forEach((t) => t.stop());
        setGravando(false);
        setSegundos(0);
        if (!descartar.current && pedacos.current.length) {
          aoEnviarVoz(new Blob(pedacos.current, { type: rec.mimeType || "audio/webm" }));
        }
      };
      rec.start();
      gravador.current = rec;
      setGravando(true);
    } catch {
      setErro("Permita o acesso ao microfone para gravar áudio.");
    }
  }

  function pararGravacao(enviarAudio: boolean) {
    descartar.current = !enviarAudio;
    gravador.current?.stop();
    gravador.current = null;
  }

  const temConteudo = Boolean(texto.trim() || arquivo);

  return (
    <div className="shrink-0 bg-wa-barra">
      {respondendo && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="min-w-0 flex-1 rounded-md border-l-4 border-wa-nome bg-wa-citacao px-3 py-2 text-sm">
            <p className="font-medium text-wa-nome">{respondendo.deMim ? "Você" : respondendo.autor ?? "Contato"}</p>
            <p className="truncate text-wa-secundario">{respondendo.texto ?? "Mídia"}</p>
          </div>
          <button type="button" onClick={aoCancelarResposta} className="grid size-11 place-items-center rounded-full text-wa-secundario" aria-label="Cancelar resposta">
            <X className="size-5" />
          </button>
        </div>
      )}

      {arquivo && (
        <div className="flex items-center gap-3 px-4 pt-2 text-sm">
          <Paperclip className="size-4 text-wa-meta" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {arquivo.name} <span className="text-wa-meta">({Math.ceil(arquivo.size / 1024)} KB)</span>
          </span>
          <button type="button" onClick={() => setArquivo(null)} className="grid size-11 place-items-center rounded-full text-wa-secundario" aria-label="Remover anexo">
            <X className="size-5" />
          </button>
        </div>
      )}

      {emojis && (
        <div className="grid grid-cols-8 gap-1 px-4 pt-2 sm:grid-cols-12">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="grid size-10 place-items-center rounded-md text-2xl hover:bg-wa-hover"
              onClick={() => {
                setTexto((t) => t + e);
                campo.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {erro && <p role="alert" className="px-4 pt-2 text-sm text-wa-perigo">{erro}</p>}

      <div className="flex items-end gap-1 px-2 py-2 sm:px-4">
        {gravando ? (
          <>
            <button type="button" onClick={() => pararGravacao(false)} className="grid size-11 place-items-center rounded-full text-wa-secundario" aria-label="Descartar áudio">
              <Trash2 className="size-6" />
            </button>
            <div className="flex h-11 flex-1 items-center gap-2 px-3 text-wa-secundario">
              <span className="size-2.5 animate-pulse rounded-full bg-wa-perigo" aria-hidden />
              Gravando {duracao(segundos)}
            </div>
            <button type="button" onClick={() => pararGravacao(true)} className="grid size-11 place-items-center rounded-full bg-wa-botao text-white" aria-label="Enviar áudio">
              <Square className="size-4 fill-current" />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEmojis((v) => !v)} className="grid size-11 shrink-0 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover" aria-label="Emojis" aria-pressed={emojis}>
              <Smile className="size-6" />
            </button>
            <button type="button" onClick={() => seletor.current?.click()} className="grid size-11 shrink-0 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover" aria-label="Anexar">
              <Paperclip className="size-6" />
            </button>
            <input
              ref={seletor}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 16 * 1024 * 1024) {
                  setErro("O arquivo passa de 16 MB.");
                  return;
                }
                setErro(null);
                setArquivo(f);
                campo.current?.focus();
              }}
            />
            <textarea
              ref={campo}
              rows={1}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                if (Date.now() - ultimoDigitando.current > 4000) {
                  ultimoDigitando.current = Date.now();
                  aoDigitar();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar();
                }
              }}
              onPaste={(e) => {
                const f = [...e.clipboardData.files][0];
                if (f) {
                  e.preventDefault();
                  setArquivo(f);
                }
              }}
              placeholder={arquivo ? "Adicione uma legenda" : "Digite uma mensagem"}
              aria-label="Mensagem"
              className="wa-rolagem max-h-[120px] min-h-[42px] flex-1 resize-none rounded-lg bg-wa-campo px-3 py-[10px] text-[15px] leading-[22px] outline-none placeholder:text-wa-meta"
            />
            {temConteudo ? (
              <button type="button" onClick={enviar} className="grid size-11 shrink-0 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover" aria-label="Enviar">
                <SendHorizontal className="size-6" />
              </button>
            ) : (
              <button type="button" onClick={() => void comecarGravacao()} className="grid size-11 shrink-0 place-items-center rounded-full text-wa-secundario hover:bg-wa-hover" aria-label="Gravar áudio">
                <Mic className="size-6" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
