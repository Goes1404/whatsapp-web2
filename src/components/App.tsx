"use client";

import { useState } from "react";
import { api } from "./api";
import { TelaConexao } from "./TelaConexao";
import { WhatsAppWeb } from "./WhatsAppWeb";
import { usePeriodico } from "./usePeriodico";
import type { Estado } from "./tipos";

/**
 * Decide entre a tela de conexão e o WhatsApp. Pergunta o estado a cada 3s
 * enquanto desconectado (é assim que a tela descobre que o QR foi lido) e a
 * cada 30s conectado (para voltar à tela de QR se o celular desconectar).
 */
export function App() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const conectado = estado?.ok === true && estado.conectado;

  usePeriodico(
    async () => {
      try {
        setEstado(await api<Estado>("/api/conexao"));
      } catch (e) {
        setEstado({ ok: false, motivo: "erro_provedor", detalhe: e instanceof Error ? e.message : String(e) });
      }
    },
    conectado ? 30_000 : 3_000,
  );

  if (!estado) {
    return (
      <main className="grid min-h-full place-items-center bg-wa-lista text-wa-meta">
        <div className="flex flex-col items-center gap-4">
          <div className="h-1 w-56 overflow-hidden rounded-full bg-wa-divisor">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-wa-botao" />
          </div>
          <p className="text-sm">WhatsApp</p>
        </div>
      </main>
    );
  }

  if (conectado && estado.ok) {
    return (
      <WhatsAppWeb
        perfil={{ nome: estado.nome, foto: estado.foto, telefone: estado.telefone }}
        aoDesconectar={() => setEstado({ ...estado, conectado: false, estado: "close" })}
      />
    );
  }

  return <TelaConexao erroProvedor={estado.ok ? null : estado.detalhe} />;
}
