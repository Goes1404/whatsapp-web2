export type { Chat, Mensagem, StatusMensagem, TipoMensagem } from "@/lib/evolution/leitura";

export type Estado =
  | { ok: true; conectado: boolean; estado: string; telefone: string | null; nome: string | null; foto: string | null }
  | { ok: false; motivo: string; detalhe: string };
