import { NextResponse } from "next/server";
import {
  buscarMensagens,
  enviarArquivo,
  enviarAudioDeVoz,
  enviarTexto,
  ProvedorIndisponivel,
} from "@/lib/evolution/conversas";
import { exigirSessao } from "@/lib/sessao/servidor";
import { jidValido } from "@/lib/evolution/jid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Contexto = { params: Promise<{ jid: string }> };

/** Teto do anexo. Na Vercel o corpo da requisição para em ~4,5 MB. */
const TETO_BYTES = 16 * 1024 * 1024;

function falha(err: unknown) {
  const status = err instanceof ProvedorIndisponivel ? 503 : 502;
  return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status });
}

export async function GET(request: Request, { params }: Contexto) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const jid = decodeURIComponent((await params).jid);
  if (!jidValido(jid)) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });
  const pagina = Math.max(1, Number(new URL(request.url).searchParams.get("pagina")) || 1);
  try {
    return NextResponse.json(await buscarMensagens(jid, pagina));
  } catch (err) {
    return falha(err);
  }
}

export async function POST(request: Request, { params }: Contexto) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const jid = decodeURIComponent((await params).jid);
  if (!jidValido(jid)) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });

  try {
    const tipo = request.headers.get("content-type") ?? "";
    if (tipo.includes("multipart/form-data")) {
      const form = await request.formData();
      const arquivo = form.get("arquivo");
      if (!(arquivo instanceof File) || arquivo.size === 0) {
        return NextResponse.json({ erro: "Nenhum arquivo enviado." }, { status: 400 });
      }
      if (arquivo.size > TETO_BYTES) {
        return NextResponse.json({ erro: "Arquivo maior que 16 MB." }, { status: 413 });
      }
      const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
      const voz = form.get("voz") === "1";
      const legenda = typeof form.get("legenda") === "string" ? String(form.get("legenda")).trim() : "";
      const r = voz
        ? await enviarAudioDeVoz(jid, base64)
        : await enviarArquivo({
            jid,
            base64,
            mimetype: arquivo.type || "application/octet-stream",
            nomeArquivo: arquivo.name || "arquivo",
            legenda: legenda || null,
          });
      return NextResponse.json(r, { status: r.enviado ? 200 : 502 });
    }

    const corpo = (await request.json().catch(() => ({}))) as { texto?: unknown; citarId?: unknown };
    const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
    if (!texto) return NextResponse.json({ erro: "Mensagem vazia." }, { status: 400 });
    const r = await enviarTexto(jid, texto, typeof corpo.citarId === "string" ? corpo.citarId : null);
    return NextResponse.json(r, { status: r.enviado ? 200 : 502 });
  } catch (err) {
    return falha(err);
  }
}
