import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_SESSAO, tokenValido } from "./token";

/** Devolve a resposta 401 quando não há sessão, ou `null` quando há. */
export async function exigirSessao(): Promise<NextResponse | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (await tokenValido(token)) return null;
  return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
}
