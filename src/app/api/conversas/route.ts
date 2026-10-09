import { NextResponse } from "next/server";
import { listarConversas, ProvedorIndisponivel } from "@/lib/evolution/conversas";
import { exigirSessao } from "@/lib/sessao/servidor";

export const dynamic = "force-dynamic";

export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  try {
    return NextResponse.json({ conversas: await listarConversas() });
  } catch (err) {
    const status = err instanceof ProvedorIndisponivel ? 503 : 502;
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status });
  }
}
