import { describe, expect, it } from "vitest";
import { comPendentes, mesclarMensagens, recebidasNaoMarcadas, type Pendente } from "./mesclar";
import type { Mensagem } from "./tipos";

function m(id: string, em: string, extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id, jid: "1@s.whatsapp.net", deMim: false, em, tipo: "texto", texto: id, nomeArquivo: null, mimetype: null,
    duracao: null, miniatura: null, status: null, autor: null, autorJid: null, citada: null, localizacao: null,
    reacoes: [], ...extra,
  };
}

describe("mesclarMensagens", () => {
  it("a versão do servidor vence (✓✓ atualizado) e a ordem é cronológica", () => {
    const r = mesclarMensagens(
      [m("b", "2026-01-01T10:01:00Z", { status: "enviada" }), m("a", "2026-01-01T10:00:00Z")],
      [m("b", "2026-01-01T10:01:00Z", { status: "lida" })],
    );
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r[1].status).toBe("lida");
  });
});

describe("comPendentes", () => {
  it("a pendente some quando o servidor traz o id real", () => {
    const p: Pendente = { ...m("temp-1", "2026-01-01T10:05:00Z", { deMim: true }), idReal: "X" };
    expect(comPendentes([m("a", "2026-01-01T10:00:00Z")], [p]).map((x) => x.id)).toEqual(["a", "temp-1"]);
    expect(comPendentes([m("X", "2026-01-01T10:05:01Z")], [p]).map((x) => x.id)).toEqual(["X"]);
  });
});

describe("recebidasNaoMarcadas", () => {
  it("só as do contato, que ainda não foram marcadas", () => {
    const lista = [m("a", "x"), m("b", "x", { deMim: true }), m("c", "x")];
    expect(recebidasNaoMarcadas(lista, new Set(["c"]))).toEqual(["a"]);
  });
});
