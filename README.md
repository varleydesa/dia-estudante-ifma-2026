# Dia do Estudante 2026 — IFMA Campus São Raimundo das Mangabeiras

Site de inscrição para as modalidades esportivas do Dia do Estudante 2026 (25 e 26/09/2026).
O formulário de inscrição muda dinamicamente conforme as modalidades marcadas pelo participante
(individual x equipe, categoria, provas, escalação de titulares/reservas no futebol, etc.).

## Como rodar

```bash
npm install
npm start
```

Depois acesse `http://localhost:3000`.

O banco de dados usa [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts) (compatível
com SQLite). Em desenvolvimento, sem nenhuma variável extra configurada, ele grava tudo em um arquivo
local criado automaticamente em `data/inscricoes.db` — ou seja, `npm install && npm start` já funciona
sem precisar de conta em lugar nenhum. Em produção, aponte para um banco [Turso](https://turso.tech)
(veja a seção "Banco de dados em produção (Turso)" abaixo) para não depender de disco persistente no
servidor.

## Estrutura

- `data/modalidades.json` — fonte única com as regras de cada modalidade (categorias, se tem nível,
  se é individual/equipe, mínimos e máximos de atletas etc.). Editar este arquivo para ajustar regras.
- `server.js` — API (`/api/modalidades`, `/api/inscricoes`, rotas de admin) e validação.
- `auth.js` — autenticação do admin (criação da conta inicial, login, troca de senha, sessão).
- `db.js` — schema e conexão com o banco (local em arquivo ou Turso, via `@libsql/client`).
- `public/` — site estático (página inicial + formulário de inscrição + área administrativa em `public/admin/`).

## Banco de dados em produção (Turso)

Turso é um serviço gerenciado de bancos SQLite (libSQL) com um plano gratuito generoso — dispensa
disco persistente na hospedagem, então funciona em qualquer plataforma (Railway, Render, Vercel etc.).

1. Crie uma conta em [turso.tech](https://turso.tech) e instale a CLI, ou use o painel web.
2. Crie um banco:
   ```bash
   turso db create dia-estudante-ifma-2026
   ```
3. Pegue a URL de conexão e gere um token de autenticação:
   ```bash
   turso db show dia-estudante-ifma-2026 --url
   turso db tokens create dia-estudante-ifma-2026
   ```
4. Defina essas duas variáveis no ambiente de produção (ou no `.env` local, se quiser testar contra o
   banco remoto):
   ```
   TURSO_DATABASE_URL=libsql://dia-estudante-ifma-2026-xxxxx.turso.io
   TURSO_AUTH_TOKEN=eyJhbGciOi...
   ```

Quando essas variáveis existem, `db.js` conecta no Turso automaticamente; quando não existem, cai de
volta para o arquivo local — não precisa mudar nada no código para alternar entre os dois ambientes.

## Área administrativa

Acesse `http://localhost:3000/admin/login.html`.

- O usuário e a senha do primeiro acesso vêm do arquivo `.env` (`ADMIN_USER_INICIAL` e
  `ADMIN_SENHA_INICIAL`). Essa conta só é criada automaticamente na primeira vez que o servidor roda
  (se ainda não existir nenhum admin no banco).
- **No primeiro login, a troca de senha é obrigatória** — o sistema redireciona direto para a tela de
  troca antes de liberar o painel. Depois de trocada uma vez, a troca vira opcional (fica disponível a
  qualquer momento pelo link "Trocar senha" dentro do painel).
- A senha final fica salva com hash (bcrypt) no banco SQLite, não em texto puro.
- O painel (`/admin/painel.html`) mostra um resumo por modalidade, uma tabela filtrável de todos os
  participantes inscritos e um botão para exportar tudo em CSV (`/api/admin/inscricoes.csv`).
- Todas as rotas `/api/admin/*` (exceto login) exigem sessão autenticada — sem login válido, respondem
  `401`.

### Variáveis de ambiente (`.env`)

```
PORT=3000
ADMIN_USER_INICIAL=usuario-do-primeiro-acesso
ADMIN_SENHA_INICIAL=senha-do-primeiro-acesso
SESSION_SECRET=uma-string-aleatoria-longa
```

Gere um `SESSION_SECRET` novo com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O arquivo `.env` **não** deve ir para o controle de versão (já está no `.gitignore`). Use
`.env.example` como modelo.
