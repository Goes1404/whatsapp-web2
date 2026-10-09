"use client";

import { useEffect, useRef, useState } from "react";
import { Users, User } from "lucide-react";
import { iniciais } from "./formato";

/*
 * Foto de perfil por jid, buscada uma vez por sessão da página e só quando o
 * avatar aparece na tela: a lista pode ter centenas de conversas, e pedir
 * todas as fotos de uma vez seria uma rajada na Evolution.
 */
const cache = new Map<string, string | null>();
const emAndamento = new Map<string, Promise<string | null>>();

function buscarFoto(jid: string): Promise<string | null> {
  if (cache.has(jid)) return Promise.resolve(cache.get(jid) ?? null);
  let p = emAndamento.get(jid);
  if (!p) {
    p = fetch(`/api/foto?jid=${encodeURIComponent(jid)}`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((j: { url?: string | null }) => j.url ?? null)
      .catch(() => null)
      .then((url) => {
        cache.set(jid, url);
        emAndamento.delete(jid);
        return url;
      });
    emAndamento.set(jid, p);
  }
  return p;
}

export function Avatar({
  jid,
  nome,
  foto,
  grupo = false,
  tamanho = 49,
}: {
  jid?: string;
  nome: string;
  foto?: string | null;
  grupo?: boolean;
  tamanho?: number;
}) {
  const [url, setUrl] = useState<string | null>(foto ?? (jid ? cache.get(jid) ?? null : null));
  const [falhou, setFalhou] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (foto || !jid || cache.has(jid)) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((itens) => {
      if (itens.some((i) => i.isIntersecting)) {
        obs.disconnect();
        void buscarFoto(jid).then(setUrl);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [jid, foto]);

  const mostrar = (foto ?? url) && !falhou ? (foto ?? url)! : null;
  const letras = iniciais(nome);

  return (
    <span
      ref={ref}
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-wa-divisor text-wa-secundario"
      style={{ width: tamanho, height: tamanho }}
      aria-hidden
    >
      {mostrar ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto do CDN do WhatsApp, URL assinada e temporária
        <img src={mostrar} alt="" className="size-full object-cover" onError={() => setFalhou(true)} />
      ) : grupo ? (
        <Users style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} />
      ) : letras && !/^\d/.test(letras) ? (
        <span style={{ fontSize: tamanho * 0.38 }} className="font-medium">
          {letras}
        </span>
      ) : (
        <User style={{ width: tamanho * 0.55, height: tamanho * 0.55 }} />
      )}
    </span>
  );
}
