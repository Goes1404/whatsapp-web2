"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

export default function Entrar() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { erro?: string };
      setErro(j.erro ?? "Não foi possível entrar.");
    } catch {
      setErro("Sem conexão com o servidor.");
    }
    setEnviando(false);
  }

  return (
    <main className="flex min-h-full flex-col items-center bg-wa-app">
      <div className="h-56 w-full bg-wa-faixa" aria-hidden />
      <form
        onSubmit={entrar}
        className="-mt-36 w-[calc(100%-2rem)] max-w-md rounded-lg bg-wa-lista p-8 shadow-lg"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-wa-botao text-white">
            <Lock className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-light">WhatsApp Web</h1>
            <p className="text-sm text-wa-meta">Digite a senha de acesso desta instalação.</p>
          </div>
        </div>
        <label className="block text-sm text-wa-secundario" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-wa-divisor bg-wa-campo px-3 outline-none focus:border-wa-botao"
        />
        {erro && (
          <p role="alert" className="mt-3 text-sm text-wa-perigo">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando || !senha}
          className="mt-6 h-11 w-full rounded-full bg-wa-botao font-medium text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
