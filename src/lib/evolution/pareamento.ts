/**
 * O que fazer antes de pedir um código de pareamento, dado o estado atual
 * da instância na Evolution.
 *
 * Existe como função pura porque a regra é sutil e cara de errar. A
 * Evolution v2 trata o parâmetro `?number=` do `/instance/connect` assim:
 *
 * | estado       | o que faz com `?number=`                          |
 * |--------------|---------------------------------------------------|
 * | `open`       | ignora — devolve o estado da conexão               |
 * | `connecting` | **ignora o número e devolve o QR em cache**        |
 * | `close`      | chama `requestPairingCode` → devolve `pairingCode` |
 *
 * A linha do meio é a que quebrava tudo: bastava um QR ter sido aberto
 * segundos antes para o número ser silenciosamente descartado, e o código
 * de 8 caracteres nunca chegar. Por isso `connecting` exige derrubar a
 * sessão pendente (logout) antes de pedir o código.
 */
export type DecisaoPareamento =
  /** Já conectado: recusar. Derrubar a sessão é decisão do usuário, no botão Desconectar. */
  | { acao: "recusar"; motivo: "ja_conectado" }
  /** Há um QR pendente segurando o socket: derrubar antes de pedir o código. */
  | { acao: "encerrar_antes" }
  /** Caminho livre — pedir o código direto. */
  | { acao: "seguir" };

export function decidirPareamentoPorNumero(estado: string | null): DecisaoPareamento {
  switch (estado) {
    case "open":
      return { acao: "recusar", motivo: "ja_conectado" };
    case "connecting":
      return { acao: "encerrar_antes" };
    // `close`, instância inexistente ou estado que não reconhecemos: seguir.
    // Um logout preventivo aqui não custaria nada em `close`, mas num estado
    // novo da Evolution poderia derrubar uma sessão boa — e o pior desfecho
    // deste caminho é o usuário perder um número que estava funcionando.
    default:
      return { acao: "seguir" };
  }
}
