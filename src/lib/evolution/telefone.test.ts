import { describe, expect, it } from "vitest";
import { normalizarTelefoneBr } from "./telefone";

describe("normalizarTelefoneBr", () => {
  /*
   * Os três primeiros são telefones REAIS da fila de produção que falharam
   * como "Número não está no WhatsApp" em 26/08/2026. O `55` que faltava era
   * a única coisa errada.
   */
  it("põe o DDI no telefone cadastrado com pontuação", () => {
    expect(normalizarTelefoneBr("11.95721-6675")).toBe("5511957216675");
    expect(normalizarTelefoneBr("11.95431-4304")).toBe("5511954314304");
    expect(normalizarTelefoneBr("11.99573-8920")).toBe("5511995738920");
  });

  it("aceita os formatos que uma pessoa digita", () => {
    expect(normalizarTelefoneBr("(11) 99573-8920")).toBe("5511995738920");
    expect(normalizarTelefoneBr("11 99573 8920")).toBe("5511995738920");
    expect(normalizarTelefoneBr("11995738920")).toBe("5511995738920");
  });

  it("não mexe no que já está normalizado", () => {
    expect(normalizarTelefoneBr("5511995738920")).toBe("5511995738920");
    expect(normalizarTelefoneBr("+55 11 99573-8920")).toBe("5511995738920");
    expect(normalizarTelefoneBr("551132223333")).toBe("551132223333"); // fixo, 12 dígitos
  });

  it("assume São Paulo quando falta o DDD — mesmo palpite do banco", () => {
    expect(normalizarTelefoneBr("99573-8920")).toBe("5511995738920");
    expect(normalizarTelefoneBr("32223333")).toBe("551132223333");
  });

  it("não inventa DDI brasileiro para número estrangeiro", () => {
    expect(normalizarTelefoneBr("14155552671")).toBe("5514155552671"); // 11 díg: cai na regra BR
    expect(normalizarTelefoneBr("447911123456")).toBe("447911123456"); // 12 díg sem 55: intacto
  });

  it("devolve null em vez de chutar", () => {
    // Mandar para número inventado é pior que não mandar: gasta cota, conta
    // como falha do provedor e pode alcançar um desconhecido.
    expect(normalizarTelefoneBr("")).toBeNull();
    expect(normalizarTelefoneBr(null)).toBeNull();
    expect(normalizarTelefoneBr(undefined)).toBeNull();
    expect(normalizarTelefoneBr("abc")).toBeNull();
    expect(normalizarTelefoneBr("1234")).toBeNull();
  });
});
