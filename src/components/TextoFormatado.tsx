import { Fragment, type ReactNode } from "react";

/**
 * Formatação do WhatsApp: *negrito*, _itálico_, ~tachado~, ```mono``` e
 * links clicáveis. O texto nunca vira HTML: só nós de React.
 */
const PADRAO = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;

export function TextoFormatado({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(PADRAO)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) partes.push(<Fragment key={i++}>{texto.slice(ultimo, inicio)}</Fragment>);
    const s = m[0];
    if (s.startsWith("```")) partes.push(<code key={i++} className="font-mono text-[13px]">{s.slice(3, -3)}</code>);
    else if (s.startsWith("*")) partes.push(<strong key={i++} className="font-semibold">{s.slice(1, -1)}</strong>);
    else if (s.startsWith("_")) partes.push(<em key={i++}>{s.slice(1, -1)}</em>);
    else if (s.startsWith("~")) partes.push(<s key={i++}>{s.slice(1, -1)}</s>);
    else {
      const limpo = s.replace(/[.,;:!?)]+$/, "");
      const resto = s.slice(limpo.length);
      const href = limpo.startsWith("http") ? limpo : `https://${limpo}`;
      partes.push(
        <a key={i++} href={href} target="_blank" rel="noopener noreferrer" className="text-[#027eb5] underline dark:text-[#53bdeb]">
          {limpo}
        </a>,
      );
      if (resto) partes.push(<Fragment key={i++}>{resto}</Fragment>);
    }
    ultimo = inicio + s.length;
  }
  if (ultimo < texto.length) partes.push(<Fragment key={i++}>{texto.slice(ultimo)}</Fragment>);
  return <>{partes}</>;
}
