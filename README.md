# whatsapp-web2

Um WhatsApp Web próprio: a pessoa conecta o número dela (QR Code ou código de
pareamento) e usa o WhatsApp no navegador — lista de conversas, chat com
fotos, vídeos, áudios, documentos, reações, respostas, ✓✓ de entrega/leitura,
envio de texto, anexo e mensagem de voz.

A parte de conexão foi copiada do **next-home** (`src/lib/whatsapp/provider.ts`,
`pareamento.ts`, `telefone.ts` e a tela `PainelConexao`), com as mesmas regras:

- pareamento por código olha o estado antes: em `connecting` a Evolution
  ignora o `?number=` e devolve o QR em cache, então a sessão pendente é
  derrubada primeiro;
- só `open` conta como conectado;
- "Desconectar" faz `logout`, que preserva a instância;
- envio só conta como feito quando a Evolution devolve `key.id`;
- a mídia recebida é decifrada pela Evolution (`getBase64FromMediaMessage`) —
  a URL do WhatsApp aponta para o arquivo cifrado.

## Como funciona

```
WhatsApp ──▶ Evolution API ──webhook──▶ /api/webhook/evolution ──▶ Supabase
                    ▲                                                  │
                    └──── enviar / mídia ◀── rotas /api/* ◀── navegador (consulta a cada 3–5 s)
```

- O **webhook** grava cada mensagem nova, o histórico que o celular envia ao
  conectar (`syncFullHistory`), os ✓✓ de entrega/leitura, reações e nomes de
  contato nas tabelas `wa_conversas`, `wa_mensagens` e `wa_contatos`.
- A mensagem que você envia é gravada na hora, pela própria resposta do envio.
- A **mídia** é decifrada pela Evolution sob demanda, com a mensagem inteira
  guardada no banco (`bruto`) — funciona mesmo com a Evolution sem armazenamento.
- Banco vazio numa conversa: o que a Evolution tiver guardado é importado na
  primeira abertura.
- Sem `SUPABASE_URL`/`SUPABASE_SECRET_KEY`, o app lê direto do armazenamento
  da Evolution (exige `DATABASE_SAVE_DATA_*` ligado no servidor dela).

### Configurar o banco (uma vez)

1. No Supabase → **SQL Editor**, cole e rode
   `supabase/migrations/0001_whatsapp_web.sql`.
2. Preencha `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WHATSAPP_WEBHOOK_URL` e
   `WHATSAPP_WEBHOOK_SECRET` (ver `.env.example`).
3. Conecte o número. O webhook é registrado na instância a cada conexão (e
   reconferido a cada 10 min), então não há nada para configurar no painel
   da Evolution.

As tabelas têm RLS ligada e nenhuma policy, e os grants de `anon` e
`authenticated` são revogados: só o servidor do app, com a chave secreta,
lê e escreve.

## Rodar

```bash
cp .env.example .env.local   # preencha
npm install
npm run dev                  # http://localhost:3000
```

Verificações: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Rotas

| rota | o que faz |
|---|---|
| `POST /api/sessao` | entra com `APP_SENHA` (cookie assinado, 30 dias) |
| `GET/POST/DELETE /api/conexao` | estado · QR ou código de pareamento · desconectar |
| `GET /api/conversas` | lista de conversas |
| `GET/POST /api/conversas/[jid]/mensagens` | página de mensagens · enviar texto, arquivo ou voz |
| `POST /api/conversas/[jid]/lidas` | marca como lidas (✓✓ azul do outro lado) |
| `POST /api/conversas/[jid]/digitando` | mostra "digitando…" |
| `GET /api/midia` | foto/vídeo/áudio/documento decifrado |
| `GET /api/foto` | foto de perfil |
| `POST /api/webhook/evolution` | eventos da Evolution (exige `x-webhook-secret`) |

Tudo exige sessão (`src/proxy.ts` + checagem em cada rota), menos o
webhook, que exige o segredo dele.

## Limites conhecidos

- **Atualização por consulta**, não em tempo real: mensagem nova aparece em
  até ~3 s no chat aberto e ~5 s na lista. Funciona em qualquer hospedagem
  (inclusive serverless).
- Uma instância por instalação (`WHATSAPP_INSTANCIA`): é o WhatsApp de uma
  pessoa.
- Anexo até 16 MB; na Vercel, o corpo da requisição para em ~4,5 MB.
- Não há chamadas de voz/vídeo, status nem criação de grupos.
