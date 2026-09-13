const bcrypt = require('bcryptjs');
const { db } = require('./db');

async function seedAdminSeNecessario() {
  const { rows } = await db.execute('SELECT id FROM admin WHERE id = 1');
  if (rows.length > 0) return;

  const usuario = process.env.ADMIN_USER_INICIAL;
  const senha = process.env.ADMIN_SENHA_INICIAL;

  if (!usuario || !senha) {
    console.warn(
      'Aviso: ADMIN_USER_INICIAL/ADMIN_SENHA_INICIAL não definidos no .env — nenhuma conta de admin foi criada.'
    );
    return;
  }

  const hash = bcrypt.hashSync(senha, 10);
  await db.execute({
    sql: 'INSERT INTO admin (id, usuario, senha_hash, senha_trocada) VALUES (1, ?, ?, 0)',
    args: [usuario, hash],
  });
  console.log(`Conta de admin criada para "${usuario}". Troca de senha será exigida no primeiro login.`);
}

async function buscarAdmin() {
  const { rows } = await db.execute('SELECT * FROM admin WHERE id = 1');
  return rows[0] || null;
}

async function verificarLogin(usuario, senha) {
  const admin = await buscarAdmin();
  if (!admin) return null;
  if (String(admin.usuario).trim().toLowerCase() !== String(usuario).trim().toLowerCase()) return null;
  const confere = bcrypt.compareSync(String(senha), admin.senha_hash);
  return confere ? admin : null;
}

async function trocarSenha(novaSenha) {
  const hash = bcrypt.hashSync(novaSenha, 10);
  await db.execute({
    sql: "UPDATE admin SET senha_hash = ?, senha_trocada = 1, atualizado_em = datetime('now','localtime') WHERE id = 1",
    args: [hash],
  });
}

async function conferirSenhaAtual(senha) {
  const admin = await buscarAdmin();
  if (!admin) return false;
  return bcrypt.compareSync(String(senha), admin.senha_hash);
}

function exigirLogin(req, res, next) {
  if (req.session && req.session.adminLogado) return next();
  return res.status(401).json({ erro: 'Sessão expirada ou não autenticada. Faça login novamente.' });
}

module.exports = {
  seedAdminSeNecessario,
  buscarAdmin,
  verificarLogin,
  trocarSenha,
  conferirSenhaAtual,
  exigirLogin,
};
