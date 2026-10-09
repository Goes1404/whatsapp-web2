import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, tokenValido } from "@/lib/sessao/token";

/**
 * Porta única: sem sessão, página vai para /entrar e API responde 401.
 * As rotas também conferem (`exigirSessao`) — o proxy é a primeira linha,
 * não a única.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/entrar" || pathname === "/api/sessao" || pathname === "/api/webhook/evolution") {
    return NextResponse.next(); // o webhook confere o próprio segredo
  }

  const ok = await tokenValido(request.cookies.get(COOKIE_SESSAO)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|svg|jpg|webp|ico)$).*)"],
};
