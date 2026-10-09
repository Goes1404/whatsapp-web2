import { NextResponse } from "next/server";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarToken, senhaConfere } from "@/lib/sessao/token";

export async function POST(request: Request) {
  if (!process.env.APP_SENHA || !process.env.SESSAO_SEGREDO) {
    return NextResponse.json(
      { erro: "Defina APP_SENHA e SESSAO_SEGREDO nas variáveis de ambiente para liberar o acesso." },
      { status: 503 },
    );
  }
  const corpo = (await request.json().catch(() => ({}))) as { senha?: unknown };
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  if (!(await senhaConfere(senha))) {
    // Atraso fixo: tentativa e erro em massa fica cara.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ erro: "Senha incorreta." }, { status: 401 });
  }
  const token = await criarToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, "", { path: "/", maxAge: 0 });
  return res;
}
