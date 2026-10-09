import { describe, expect, it } from "vitest";
import { jidListavel, lerChats, lerMensagens, previa, telefoneLegivel } from "./leitura";

const ts = 1_760_000_000; // segundos

function reg(id: string, message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const { key, ...resto } = extra;
  return {
    key: { id, fromMe: false, remoteJid: "5511991234567@s.whatsapp.net", ...(key as object) },
    message,
    messageTimestamp: ts,
    pushName: "Ana",
    ...resto,
  };
}

describe("lerMensagens", () => {
  it("aceita os três formatos de resposta da Evolution", () => {
    const um = [reg("A1", { conversation: "oi" })];
    expect(lerMensagens(um)).toHaveLength(1);
    expect(lerMensagens({ records: um })).toHaveLength(1);
    expect(lerMensagens({ messages: { records: um, pages: 1 } })).toHaveLength(1);
  });

  it("lê texto, legenda de imagem e documento dentro de envelope", () => {
    const [t, img, doc] = lerMensagens([
      reg("A1", { extendedTextMessage: { text: "olá *mundo*" } }),
      reg("A2", { imageMessage: { caption: "fachada", mimetype: "image/jpeg", jpegThumbnail: "AAA" } }, { messageTimestamp: ts + 1 }),
      reg(
        "A3",
        { documentWithCaptionMessage: { message: { documentMessage: { fileName: "planta.pdf", mimetype: "application/pdf" } } } },
        { messageTimestamp: ts + 2 },
      ),
    ]);
    expect(t).toMatchObject({ tipo: "texto", texto: "olá *mundo*", autor: "Ana" });
    expect(img).toMatchObject({ tipo: "imagem", texto: "fachada", miniatura: "AAA" });
    expect(doc).toMatchObject({ tipo: "documento", nomeArquivo: "planta.pdf" });
  });

  it("ordena da mais antiga para a mais recente e não repete", () => {
    const lidas = lerMensagens([
      reg("B", { conversation: "2" }, { messageTimestamp: ts + 10 }),
      reg("A", { conversation: "1" }),
      reg("B", { conversation: "2" }, { messageTimestamp: ts + 10 }),
    ]);
    expect(lidas.map((m) => m.id)).toEqual(["A", "B"]);
  });

  it("status de envio: o mais avançado entre status e MessageUpdate", () => {
    const [m] = lerMensagens([
      reg("A", { conversation: "x" }, {
        key: { fromMe: true },
        status: "SERVER_ACK",
        MessageUpdate: [{ status: "DELIVERY_ACK" }, { status: "READ" }],
      }),
    ]);
    expect(m.deMim).toBe(true);
    expect(m.status).toBe("lida");
  });

  it("reação vira emoji na mensagem reagida, não um balão", () => {
    const lidas = lerMensagens([
      reg("A", { conversation: "foto linda" }),
      reg("R", { reactionMessage: { key: { id: "A" }, text: "❤️" } }, { messageTimestamp: ts + 5 }),
    ]);
    expect(lidas).toHaveLength(1);
    expect(lidas[0].reacoes).toEqual(["❤️"]);
  });

  it("mensagem apagada vira aviso; protocolo que não é revogação some", () => {
    const lidas = lerMensagens([
      reg("A", { protocolMessage: { type: 0 } }),
      reg("B", { protocolMessage: { type: 3 } }),
    ]);
    expect(lidas.map((m) => m.tipo)).toEqual(["apagada"]);
  });

  it("citação traz o texto da mensagem respondida", () => {
    const [m] = lerMensagens([
      reg("A", {
        extendedTextMessage: {
          text: "sim",
          contextInfo: { participant: "5511988887777@s.whatsapp.net", quotedMessage: { conversation: "pode ser às 9h?" } },
        },
      }),
    ]);
    expect(m.citada).toEqual({ autor: "+55 11 98888-7777", texto: "pode ser às 9h?" });
  });
});

describe("lerChats", () => {
  it("usa o contato, ordena por atividade e tira status/broadcast", () => {
    const chats = lerChats(
      [
        { remoteJid: "status@broadcast", updatedAt: "2026-10-09T12:00:00Z" },
        {
          remoteJid: "5511991234567@s.whatsapp.net",
          unreadCount: 2,
          lastMessage: reg("A", { conversation: "oi" }),
        },
        {
          remoteJid: "1203630@g.us",
          updatedAt: "2030-01-01T00:00:00Z",
          lastMessage: {
            ...reg("B", { imageMessage: {} }, { messageTimestamp: ts + 100 }),
            key: { id: "B", fromMe: false, remoteJid: "1203630@g.us", participant: "5511988887777@s.whatsapp.net" },
            pushName: "Beto",
          },
        },
      ],
      { grupos: new Map([["1203630@g.us", "Família"]]) },
    );
    expect(chats.map((c) => c.nome)).toEqual(["Família", "Ana"]);
    expect(chats[0].ultima?.texto).toBe("Beto: 📷 Foto");
    expect(chats[1]).toMatchObject({ naoLidas: 2, telefone: "+55 11 99123-4567", grupo: false });
  });

  it("sem nome nenhum, mostra o telefone legível", () => {
    const [c] = lerChats([{ remoteJid: "551133334444@s.whatsapp.net" }]);
    expect(c.nome).toBe("+55 11 3333-4444");
  });
});

describe("utilitários", () => {
  it("telefoneLegivel", () => {
    expect(telefoneLegivel("5511991234567@s.whatsapp.net")).toBe("+55 11 99123-4567");
    expect(telefoneLegivel("14155552671@s.whatsapp.net")).toBe("+14155552671");
    expect(telefoneLegivel("123@g.us")).toBeNull();
  });
  it("jidListavel", () => {
    expect(jidListavel("status@broadcast")).toBe(false);
    expect(jidListavel("123@newsletter")).toBe(false);
    expect(jidListavel("123@lid")).toBe(true);
  });
  it("previa", () => {
    expect(previa("documento", "a.pdf")).toBe("📄 Documento: a.pdf");
    expect(previa("imagem", null)).toBe("📷 Foto");
  });
});
