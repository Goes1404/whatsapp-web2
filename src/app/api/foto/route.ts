import { NextResponse } from "next/server";
import { fotoDePerfil } from "@/lib/evolution/conversas";
import { exigirSessao } from "@/lib/sessao/servidor";
import { jidValido } from "@/lib/evolution/jid";

/** Foto de perfil de um contato ou grupo (a lista não traz para todos). */
export async function GET(request: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const jid = new URL(request.url).searchParams.get("jid") ?? "";
  if (!jidValido(jid)) return NextResponse.json({ url: null }, { status: 400 });
  return NextResponse.json(
    { url: await fotoDePerfil(jid) },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
