import { describe, expect, it } from "vitest";
import { interpretarEvento, nomeDoEvento } from "./webhook";

const ts = 1_760_000_000;
const msg = (id: string, extra: Record<string, unknown> = {}) => ({
  key: { id, fromMe: false, remoteJid: "5511991234567@s.whatsapp.net" },
  pushName: "Ana",
  message: { conversation: "oi" },
  messageTimestamp: ts,
  ...extra,
});

describe("interpretarEvento", () => {
  it("aceita os dois formatos de nome", () => {
    expect(nomeDoEvento("messages.upsert")).toBe("MESSAGES_UPSERT");
    expect(nomeDoEvento("MESSAGES_UPSERT")).toBe("MESSAGES_UPSERT");
  });

  it("messages.upsert com data solto vira mensagem nova, com o bruto guardado", () => {
    const e = interpretarEvento({ event: "messages.upsert", instance: "x", data: msg("A1") });
    expect(e.tipo).toBe("mensagens");
    if (e.tipo !== "mensagens") return;
    expect(e.historico).toBe(false);
    expect(e.mensagens.map((m) => m.id)).toEqual(["A1"]);
    expect(e.brutos.get("A1")).toEqual({ key: msg("A1").key, message: msg("A1").message });
  });

  it("messages.set (histórico do celular) não conta como não lida", () => {
    const e = interpretarEvento({ event: "messages.set", data: { messages: [msg("A1"), msg("A2")] } });
    expect(e.tipo === "mensagens" && e.historico).toBe(true);
    expect(e.tipo === "mensagens" && e.mensagens.length).toBe(2);
  });

  it("upsert do tipo append também é histórico", () => {
    const e = interpretarEvento({ event: "messages.upsert", data: { ...msg("A1"), type: "append" } });
    expect(e.tipo === "mensagens" && e.historico).toBe(true);
  });

  it("reação chega separada da mensagem", () => {
    const e = interpretarEvento({
      event: "messages.upsert",
      data: msg("R1", { message: { reactionMessage: { key: { id: "A1" }, text: "👍" } } }),
    });
    expect(e.tipo === "mensagens" && e.mensagens.length).toBe(0);
    expect(e.tipo === "mensagens" && e.reacoes[0]).toMatchObject({ alvo: "A1", emoji: "👍" });
  });

  it("messages.update nos dois formatos da Evolution", () => {
    expect(interpretarEvento({ event: "messages.update", data: { keyId: "A1", status: "READ" } })).toEqual({
      tipo: "status",
      itens: [{ id: "A1", status: "lida" }],
    });
    expect(
      interpretarEvento({ event: "MESSAGES_UPDATE", data: [{ key: { id: "A2" }, update: { status: 3 } }] }),
    ).toEqual({ tipo: "status", itens: [{ id: "A2", status: "entregue" }] });
  });

  it("contatos", () => {
    const e = interpretarEvento({
      event: "contacts.upsert",
      data: [{ remoteJid: "5511991234567@s.whatsapp.net", pushName: "Ana Prado" }, { remoteJid: null }],
    });
    expect(e).toEqual({ tipo: "contatos", contatos: [{ jid: "5511991234567@s.whatsapp.net", nome: "Ana Prado", foto: null }] });
  });

  it("evento desconhecido é ignorado, não erro", () => {
    expect(interpretarEvento({ event: "presence.update", data: {} }).tipo).toBe("ignorar");
    expect(interpretarEvento(null).tipo).toBe("ignorar");
  });
});
