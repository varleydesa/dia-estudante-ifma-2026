const path = require('path');
const { createClient } = require('@libsql/client');

// Em produção (ex: Railway, Vercel), aponte TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// para um banco Turso — assim não é preciso disco persistente no servidor.
// Sem essas variáveis, usa um arquivo SQLite local (bom para desenvolvimento).
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'data', 'inscricoes.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient(authToken ? { url, authToken } : { url });

async function iniciar() {
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
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
      id INTEGER PRIMARY KEY CHECK (id = 1),
      usuario TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      senha_trocada INTEGER NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

module.exports = { db, iniciar };
