"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, Lock, RefreshCw } from "lucide-react";
import { api } from "./api";

type Pareamento =
  | { ok: true; qrcodeBase64: string | null; codigoPareamento: string | null; desfecho: "codigo" | "qr" | "ja_conectado" | "sem_codigo" }
  | { ok: false; motivo: string; detalhe: string };

/**
 * A tela de entrada do web.whatsapp.com: instruções à esquerda, QR Code à
 * direita, e "Conectar com número de telefone" para quem está no próprio
 * celular (não dá para apontar a câmera para o QR exibido nele mesmo).
 *
 * O fim do pareamento acontece no celular, fora do nosso alcance: quem avisa
 * a tela é o `App`, que pergunta o estado a cada 3s. O QR do WhatsApp vence
 * em ~20s, então ele é renovado sozinho a cada 25s enquanto a tela está aberta.
 */
export function TelaConexao({ erroProvedor }: { erroProvedor: string | null }) {
  const [modo, setModo] = useState<"qr" | "codigo">("qr");
  const [qr, setQr] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedidoRef = useRef(0);

  const pedirQr = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCarregando(true);
    try {
      const r = await api<Pareamento>("/api/conexao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (pedido !== pedidoRef.current) return;
      if (!r.ok) {
        setErro(r.detalhe);
      } else if (r.qrcodeBase64) {
        setErro(null);
        setQr(r.qrcodeBase64.startsWith("data:") ? r.qrcodeBase64 : `data:image/png;base64,${r.qrcodeBase64}`);
      } else if (r.desfecho === "sem_codigo") {
        setErro("O servidor do WhatsApp respondeu sem QR Code. Tente de novo.");
      }
    } catch (e) {
      if (pedido === pedidoRef.current) setErro(e instanceof Error ? e.message : String(e));
    }
    if (pedido === pedidoRef.current) setCarregando(false);
  }, []);

  useEffect(() => {
    if (modo !== "qr") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primeira carga do QR
    void pedirQr();
    const id = setInterval(() => void pedirQr(), 25_000);
    return () => clearInterval(id);
  }, [modo, pedirQr]);

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault();
    pedidoRef.current++;
    setCarregando(true);
    setErro(null);
    setCodigo(null);
    try {
      const r = await api<Pareamento>("/api/conexao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone }),
      });
      if (!r.ok) setErro(r.detalhe);
      else if (r.codigoPareamento) setCodigo(r.codigoPareamento);
      else if (r.desfecho === "ja_conectado") setErro("Este número já está conectado.");
      else setErro("O WhatsApp não devolveu o código. Confira o número (com DDD) e tente de novo.");
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : String(e2));
    }
    setCarregando(false);
  }

  const codigoFormatado = codigo ? codigo.replace(/-/g, "").replace(/^(.{4})(.{4})$/, "$1-$2") : null;

  return (
    <main className="flex min-h-full flex-col items-center bg-wa-app pb-10">
      <div className="h-56 w-full bg-wa-faixa" aria-hidden>
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 pt-7 text-sm font-medium uppercase tracking-wide text-white">
          <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden>
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.09c-.24.68-1.42 1.3-1.96 1.38-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.8-4.18-4.94-4.37-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.37-.43.5-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.42.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.26.1 1.69.8 1.98.94.29.14.48.22.55.34.07.12.07.7-.17 1.38Z" />
          </svg>
          WhatsApp Web
        </div>
      </div>

      <section className="-mt-24 w-[calc(100%-2rem)] max-w-5xl rounded-md bg-wa-lista shadow-lg">
        <div className="grid gap-10 p-8 sm:p-14 md:grid-cols-[1fr_auto]">
          <div>
            <h1 className="text-2xl font-light sm:text-[28px]">
              {modo === "qr" ? "Use o WhatsApp no seu computador" : "Insira o código no seu celular"}
            </h1>
            {erroProvedor && (
              <p role="alert" className="mt-4 rounded-md bg-wa-perigo/10 p-3 text-sm text-wa-perigo">
                {erroProvedor}
              </p>
            )}
            {modo === "qr" ? (
              <ol className="mt-8 list-decimal space-y-5 pl-5 text-lg text-wa-secundario">
                <li>Abra o WhatsApp no seu celular.</li>
                <li>
                  Toque em <strong className="font-medium text-wa-texto">Mais opções</strong> ou{" "}
                  <strong className="font-medium text-wa-texto">Configurações</strong> e selecione{" "}
                  <strong className="font-medium text-wa-texto">Dispositivos conectados</strong>.
                </li>
                <li>
                  Toque em <strong className="font-medium text-wa-texto">Conectar dispositivo</strong>.
                </li>
                <li>Aponte seu celular para esta tela para escanear o QR code.</li>
              </ol>
            ) : (
              <ol className="mt-8 list-decimal space-y-5 pl-5 text-lg text-wa-secundario">
                <li>Abra o WhatsApp no seu celular.</li>
                <li>
                  Toque em <strong className="font-medium text-wa-texto">Dispositivos conectados</strong> →{" "}
                  <strong className="font-medium text-wa-texto">Conectar dispositivo</strong>.
                </li>
                <li>
                  Toque em <strong className="font-medium text-wa-texto">Conectar com número de telefone</strong> e
                  digite o código abaixo.
                </li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => {
                setErro(null);
                setCodigo(null);
                setModo(modo === "qr" ? "codigo" : "qr");
              }}
              className="mt-10 inline-flex min-h-11 items-center text-wa-verde underline-offset-4 hover:underline"
            >
              {modo === "qr" ? "Conectar com número de telefone" : "Conectar com QR code"}
            </button>
          </div>

          <div className="flex w-full flex-col items-center md:w-[264px]">
            {modo === "qr" ? (
              <div className="relative grid size-[264px] place-items-center rounded-md bg-white p-2">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR em data URL, muda a cada 25s
                  <img src={qr} alt="QR Code para conectar o WhatsApp" className="size-full" />
                ) : (
                  <span className="text-sm text-[#667781]">{carregando ? "Gerando QR code…" : "QR code indisponível"}</span>
                )}
                {erro && !carregando && (
                  <button
                    type="button"
                    onClick={() => void pedirQr()}
                    className="absolute inset-0 grid place-items-center rounded-md bg-white/90 text-sm text-[#008069]"
                  >
                    <span className="flex flex-col items-center gap-2">
                      <RefreshCw className="size-8" aria-hidden />
                      Clique para gerar um novo QR code
                    </span>
                  </button>
                )}
              </div>
            ) : codigoFormatado ? (
              <div className="flex flex-col items-center gap-3">
                <p
                  className="rounded-md border border-wa-divisor px-5 py-4 font-mono text-3xl tracking-[0.3em]"
                  aria-label={`Código: ${codigoFormatado.split("").join(" ")}`}
                >
                  {codigoFormatado}
                </p>
                <p className="text-center text-sm text-wa-meta">Aguardando você digitar o código no celular…</p>
                <button type="button" onClick={() => setCodigo(null)} className="min-h-11 text-sm text-wa-verde">
                  Usar outro número
                </button>
              </div>
            ) : (
              <form onSubmit={pedirCodigo} className="w-full">
                <label className="text-sm text-wa-secundario" htmlFor="telefone">
                  Número do WhatsApp (com DDD)
                </label>
                <input
                  id="telefone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-wa-divisor bg-wa-campo px-3 outline-none focus:border-wa-botao"
                />
                <button
                  type="submit"
                  disabled={carregando || telefone.replace(/\D/g, "").length < 10}
                  className="mt-4 h-11 w-full rounded-full bg-wa-botao font-medium text-white disabled:opacity-50"
                >
                  {carregando ? "Pedindo código…" : "Avançar"}
                </button>
              </form>
            )}
            {erro && modo === "codigo" && (
              <p role="alert" className="mt-3 text-center text-sm text-wa-perigo">
                {erro}
              </p>
            )}
            {erro && modo === "qr" && (
              <p role="alert" className="mt-3 max-w-[264px] text-center text-xs text-wa-perigo">
                {erro}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 border-t border-wa-divisor px-8 py-6 text-sm text-wa-meta sm:flex-row sm:justify-center">
          <Laptop className="size-4" aria-hidden />
          Fique conectado: o celular pode ficar desligado depois de conectar.
        </div>
      </section>
      <p className="mt-8 flex items-center gap-1 text-xs text-wa-meta">
        <Lock className="size-3" aria-hidden /> Suas mensagens pessoais são protegidas com a criptografia de ponta a ponta.
      </p>
    </main>
  );
}
