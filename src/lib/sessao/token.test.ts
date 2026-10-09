import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarToken, senhaConfere, tokenValido } from "./token";

describe("sessão", () => {
  beforeEach(() => {
    process.env.SESSAO_SEGREDO = "segredo-de-teste";
    process.env.APP_SENHA = "certa";
  });
  afterEach(() => {
    delete process.env.SESSAO_SEGREDO;
    delete process.env.APP_SENHA;
  });

  it("token criado vale, adulterado e vencido não", async () => {
    const t = (await criarToken())!;
    expect(await tokenValido(t)).toBe(true);
    expect(await tokenValido(t.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
    expect(await tokenValido(t, Date.now() + 31 * 86_400_000)).toBe(false);
    expect(await tokenValido("9999999999.abc")).toBe(false);
  });

  it("sem segredo configurado, nada vale (falha fechada)", async () => {
    const t = (await criarToken())!;
    delete process.env.SESSAO_SEGREDO;
    expect(await tokenValido(t)).toBe(false);
    expect(await criarToken()).toBeNull();
  });

  it("senha", async () => {
    expect(await senhaConfere("certa")).toBe(true);
    expect(await senhaConfere("errada")).toBe(false);
    expect(await senhaConfere("")).toBe(false);
  });
});
