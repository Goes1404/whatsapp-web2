import { NextResponse } from "next/server";
import { baixarMidia } from "@/lib/evolution/conversas";
import { exigirSessao } from "@/lib/sessao/servidor";
import { jidValido } from "@/lib/evolution/jid";

export const maxDuration = 60;

/**
 * Foto, vídeo, áudio ou documento de uma mensagem. A URL do WhatsApp aponta
 * para o arquivo CIFRADO (lição do next-home: baixar dali dá ruído); quem
 * decifra é a Evolution.
 */
export async function GET(request: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const p = new URL(request.url).searchParams;
  const jid = p.get("jid") ?? "";
  const id = p.get("id") ?? "";
  if (!jidValido(jid) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return NextResponse.json({ erro: "Mídia inválida." }, { status: 400 });
  }
  const midia = await baixarMidia({ jid, id, deMim: p.get("deMim") === "1" });
  if (!midia) return NextResponse.json({ erro: "Mídia indisponível." }, { status: 404 });

  const baixar = p.get("baixar") === "1";
  const nome = (midia.nome ?? p.get("nome") ?? "arquivo").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(midia.bytes), {
    headers: {
      "Content-Type": midia.mimetype,
      "Cache-Control": "private, max-age=86400, immutable",
      ...(baixar ? { "Content-Disposition": `attachment; filename="${nome}"` } : {}),
    },
  });
}
