import { NextResponse } from "next/server";
import { marcarComoLidas } from "@/lib/evolution/conversas";
import { exigirSessao } from "@/lib/sessao/servidor";
import { jidValido } from "@/lib/evolution/jid";

/** Marca como lidas (o ✓✓ azul do outro lado), como ao abrir a conversa no app. */
export async function POST(request: Request, { params }: { params: Promise<{ jid: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const jid = decodeURIComponent((await params).jid);
  if (!jidValido(jid)) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });
  const corpo = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(corpo.ids) ? corpo.ids.filter((i): i is string => typeof i === "string").slice(0, 100) : [];
  await marcarComoLidas(jid, ids);
  return NextResponse.json({ ok: true });
}
