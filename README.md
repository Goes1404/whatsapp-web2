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
navegador ──(consulta a cada 3–5 s)──▶ rotas /api/* (Next.js) ──▶ Evolution API v2 ──▶ WhatsApp
```

Não há banco de dados neste app. Conversas e mensagens vêm do que a própria
Evolution guarda: ao conectar, o celular envia o histórico
(`syncFullHistory`) e cada mensagem nova é salva por ela.

**Requisito no servidor da Evolution** (variáveis de ambiente dela, não deste
app):

```
DATABASE_ENABLED=true
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_HISTORIC=true
```

Sem isso, a lista volta vazia (a tela avisa). Atenção: a instância do
next-home **não** guarda mensagens (MEMORIA de 30/09/2026); se for usar o
mesmo servidor, ligue o armazenamento antes.

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

Tudo exige sessão (`src/proxy.ts` + checagem em cada rota).

## Limites conhecidos

- **Atualização por consulta**, não em tempo real: mensagem nova aparece em
  até ~3 s no chat aberto e ~5 s na lista. Funciona em qualquer hospedagem
  (inclusive serverless).
- Uma instância por instalação (`WHATSAPP_INSTANCIA`): é o WhatsApp de uma
  pessoa.
- Anexo até 16 MB; na Vercel, o corpo da requisição para em ~4,5 MB.
- Não há chamadas de voz/vídeo, status nem criação de grupos.
