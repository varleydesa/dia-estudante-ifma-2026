const path = require('path');
const { createClient } = require('@libsql/client');

// Em produção (ex: Railway, Vercel), aponte TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// para um banco Turso — assim não é preciso disco persistente no servidor.
// Sem essas variáveis, usa um arquivo SQLite local (bom para desenvolvimento).
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'data', 'inscricoes.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient(authToken ? { url, authToken } : { url });

// Migra a tabela "admin" do formato antigo (uma única linha fixa, id = 1)
// para suportar múltiplos administradores, preservando a conta já existente.
async function migrarAdminParaMultiUsuario() {
  const { rows } = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'admin'"
  );
  const sqlAtual = rows[0]?.sql || '';
  const precisaMigrar = /CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(sqlAtual);
  if (!precisaMigrar) return;

  await db.executeMultiple(`
    CREATE TABLE admin_novo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      senha_trocada INTEGER NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    INSERT INTO admin_novo (usuario, senha_hash, senha_trocada, atualizado_em)
      SELECT usuario, senha_hash, senha_trocada, atualizado_em FROM admin;
    DROP TABLE admin;
    ALTER TABLE admin_novo RENAME TO admin;
  `);
  console.log('Tabela "admin" migrada para suportar múltiplos administradores.');
}

// Corrige tabelas criadas antes da troca de 'localtime' (fuso do servidor,
// que na nuvem é UTC) por um deslocamento fixo de -3h (horário de Brasília).
async function migrarFusoHorario(tabela, colunaData, colunasCopiar) {
  const { rows } = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [tabela],
  });
  const sqlAtual = rows[0]?.sql || '';
  if (!sqlAtual.includes("'localtime'")) return;

  // O nome da tabela pode aparecer com ou sem aspas no SQL armazenado
  // (ex: depois de um ALTER TABLE ... RENAME anterior), então aceitamos os dois casos.
  const novoSql = sqlAtual
    .replace(/^CREATE TABLE\s+["'`]?\w+["'`]?/i, `CREATE TABLE ${tabela}_novo`)
    .replace(/datetime\('now',\s*'localtime'\)/g, "datetime('now', '-3 hours')");

  await db.executeMultiple(`
    ${novoSql};
    INSERT INTO ${tabela}_novo (${colunasCopiar}) SELECT ${colunasCopiar} FROM ${tabela};
    DROP TABLE ${tabela};
    ALTER TABLE ${tabela}_novo RENAME TO ${tabela};
  `);
  console.log(`Tabela "${tabela}" migrada para horário de Brasília (${colunaData}).`);
}

async function iniciar() {
  // O Turso mantém "foreign_keys" ligado por padrão. Migrações que recriam
  // tabelas (DROP + RENAME) disparariam ON DELETE CASCADE contra as linhas
  // dependentes (ex: participantes) se isso ficasse ligado durante o processo.
  await db.execute('PRAGMA foreign_keys = OFF');
  await migrarAdminParaMultiUsuario();
  await migrarFusoHorario('admin', 'atualizado_em', 'id, usuario, senha_hash, senha_trocada, atualizado_em');
  await migrarFusoHorario(
    'inscricoes',
    'criado_em',
    'id, modalidade_id, modalidade_nome, tipo, nivel, categoria, nome_equipe, provas, observacoes, criado_em'
  );
  await db.execute('PRAGMA foreign_keys = ON');

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS inscricoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modalidade_id TEXT NOT NULL,
      modalidade_nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nivel TEXT,
      categoria TEXT,
      nome_equipe TEXT,
      provas TEXT,
      observacoes TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS participantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inscricao_id INTEGER NOT NULL REFERENCES inscricoes(id) ON DELETE CASCADE,
      nome_completo TEXT NOT NULL,
      matricula TEXT,
      curso TEXT,
      telefone TEXT,
      email TEXT,
      capitao INTEGER NOT NULL DEFAULT 0,
      titular INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_participantes_inscricao ON participantes(inscricao_id);
    CREATE INDEX IF NOT EXISTS idx_inscricoes_modalidade ON inscricoes(modalidade_id);

    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      senha_trocada INTEGER NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
  `);
}

module.exports = { db, iniciar };
