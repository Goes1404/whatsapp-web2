import { describe, expect, it } from "vitest";
import { jidDoTelefone, jidValido } from "./jid";

describe("jid", () => {
  it("aceita só jids do WhatsApp", () => {
    expect(jidValido("5511991234567@s.whatsapp.net")).toBe(true);
    expect(jidValido("120363025@g.us")).toBe(true);
    expect(jidValido("1234567890@lid")).toBe(true);
    expect(jidValido("../../etc@s.whatsapp.net")).toBe(false);
    expect(jidValido("http://x")).toBe(false);
  });
  it("número digitado vira jid com DDI", () => {
    expect(jidDoTelefone("(11) 99123-4567")).toBe("5511991234567@s.whatsapp.net");
    expect(jidDoTelefone("abc")).toBeNull();
  });
});
