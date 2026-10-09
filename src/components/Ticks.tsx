import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react";
import type { StatusMensagem } from "./tipos";

/** ✓ enviada, ✓✓ entregue, ✓✓ azul lida — como no app. */
export function Ticks({ status, className = "" }: { status: StatusMensagem; className?: string }) {
  const base = `inline-block size-4 shrink-0 ${className}`;
  switch (status) {
    case "pendente":
      return <Clock3 className={`${base} text-wa-meta`} aria-label="Enviando" />;
    case "enviada":
      return <Check className={`${base} text-wa-meta`} aria-label="Enviada" />;
    case "entregue":
      return <CheckCheck className={`${base} text-wa-meta`} aria-label="Entregue" />;
    case "lida":
      return <CheckCheck className={`${base} text-wa-lida`} aria-label="Lida" />;
    case "erro":
      return <AlertCircle className={`${base} text-wa-perigo`} aria-label="Não enviada" />;
    default:
      return <Check className={`${base} text-wa-meta`} aria-label="Enviada" />;
  }
}
