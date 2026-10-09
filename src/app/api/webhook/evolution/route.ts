import { NextResponse } from "next/server";
import { banco } from "@/lib/banco/supabase";
import { atualizarStatus, salvarContatos, salvarMensagens } from "@/lib/banco/repositorio";
import { configDoProvedor } from "@/lib/evolution/cliente";
import { interpretarEvento } from "@/lib/evolution/webhook";
import { iguais } from "@/lib/sessao/token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recebe os eventos da Evolution e grava no banco: mensagem nova, histórico
 * do celular, ✓✓ de entrega/leitura e nomes de contato.
 *
 * Falha FECHADA: sem `WHATSAPP_WEBHOOK_SECRET` configurado, ou com o
 * cabeçalho errado, nada é gravado — o endereço é público, e sem o segredo
 * qualquer um poderia escrever mensagens falsas na conversa de alguém.
 */
export async function POST(request: Request) {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;
  const recebido = request.headers.get("x-webhook-secret") ?? "";
  if (!segredo || !iguais(recebido, segredo)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const db = banco();
  if (!db) return NextResponse.json({ ok: false, motivo: "banco não configurado" }, { status: 503 });

  const corpo = (await request.json().catch(() => null)) as { instance?: unknown } | null;
  const config = configDoProvedor();
  // Webhook global de uma Evolution compartilhada manda eventos de TODAS as
  // instâncias: só a deste app entra.
  if (config && typeof corpo?.instance === "string" && corpo.instance !== config.instancia) {
    return NextResponse.json({ ok: true, ignorado: "outra instância" });
  }

  const evento = interpretarEvento(corpo);
  try {
    switch (evento.tipo) {
      case "mensagens": {
        const r = await salvarMensagens(db, {
          mensagens: evento.mensagens,
          reacoes: evento.reacoes,
          brutos: evento.brutos,
          historico: evento.historico,
        });
        return NextResponse.json({ ok: true, novas: r.novas });
      }
      case "status":
        await atualizarStatus(db, evento.itens);
        return NextResponse.json({ ok: true, status: evento.itens.length });
      case "contatos":
        await salvarContatos(db, evento.contatos);
        return NextResponse.json({ ok: true, contatos: evento.contatos.length });
      default:
        return NextResponse.json({ ok: true, ignorado: evento.motivo });
    }
  } catch (err) {
    console.error("[webhook]", err);
    // 500 faz a Evolution tentar de novo; o upsert por id torna isso seguro.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
