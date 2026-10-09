import { describe, expect, it } from "vitest";
import { decidirPareamentoPorNumero } from "./pareamento";

describe("Decisão antes de pedir o código de pareamento", () => {
  it("com o número conectado, recusa em vez de derrubar a sessão", () => {
    // Gerar o código exigiria logout — e derrubar um atendimento em
    // produção nunca pode ser efeito colateral de um clique.
    expect(decidirPareamentoPorNumero("open")).toEqual({
      acao: "recusar",
      motivo: "ja_conectado",
    });
  });

  it("com um QR pendente, encerra a sessão antes — senão a Evolution ignora o número", () => {
    // Era exatamente este o bug: o botão Conectar abria o QR, a instância
    // ia para 'connecting', e daí em diante o `?number=` era descartado em
    // silêncio e o código nunca aparecia na tela.
    expect(decidirPareamentoPorNumero("connecting")).toEqual({ acao: "encerrar_antes" });
  });

  it("em 'close' segue direto", () => {
    expect(decidirPareamentoPorNumero("close")).toEqual({ acao: "seguir" });
  });

  it("instância inexistente segue direto — o create é quem vai criá-la", () => {
    expect(decidirPareamentoPorNumero(null)).toEqual({ acao: "seguir" });
  });

  it("estado desconhecido segue direto, nunca derruba", () => {
    // Um estado novo da Evolution não pode virar logout preventivo: o pior
    // desfecho aqui é o corretor perder um número que estava bom.
    expect(decidirPareamentoPorNumero("refused")).toEqual({ acao: "seguir" });
  });
});
