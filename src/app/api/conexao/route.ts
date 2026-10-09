import { NextResponse } from "next/server";
import { consultarEstado, desconectar, pedirPareamento } from "@/lib/evolution/conexao";
import { exigirSessao } from "@/lib/sessao/servidor";

export const dynamic = "force-dynamic";

/** Estado da conexão: a tela pergunta a cada poucos segundos durante o pareamento. */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  return NextResponse.json(await consultarEstado());
}

/** Pede o pareamento: `{ telefone }` = código de 8 caracteres; sem telefone = QR Code. */
export async function POST(request: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const corpo = (await request.json().catch(() => ({}))) as { telefone?: unknown };
  const telefone = typeof corpo.telefone === "string" && corpo.telefone.trim() ? corpo.telefone : null;
  return NextResponse.json(await pedirPareamento(telefone));
}

/** Desconectar (logout): derruba a sessão e preserva a instância. */
export async function DELETE() {
  const negado = await exigirSessao();
  if (negado) return negado;
  return NextResponse.json(await desconectar());
}
