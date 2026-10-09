import { NextResponse } from "next/server";
import { enviarDigitando } from "@/lib/evolution/conversas";
import { exigirSessao } from "@/lib/sessao/servidor";
import { jidValido } from "@/lib/evolution/jid";

export async function POST(_request: Request, { params }: { params: Promise<{ jid: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const jid = decodeURIComponent((await params).jid);
  if (jidValido(jid)) await enviarDigitando(jid);
  return NextResponse.json({ ok: true });
}
