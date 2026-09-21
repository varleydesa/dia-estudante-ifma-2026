const bcrypt = require('bcryptjs');
const { db } = require('./db');

async function seedAdminSeNecessario() {
  const { rows } = await db.execute('SELECT COUNT(*) AS total FROM admin');
  if (rows[0].total > 0) return;

  const usuario = process.env.ADMIN_USER_INICIAL;
  const senha = process.env.ADMIN_SENHA_INICIAL;

  if (!usuario || !senha) {
    console.warn(
      'Aviso: ADMIN_USER_INICIAL/ADMIN_SENHA_INICIAL não definidos no .env — nenhuma conta de admin foi criada.'
    );
    return;
  }

  await criarAdmin(usuario, senha);
  console.log(`Conta de admin criada para "${usuario}". Troca de senha será exigida no primeiro login.`);
}

async function criarAdmin(usuario, senha, papel = 'admin') {
  const hash = bcrypt.hashSync(senha, 10);
  await db.execute({
    sql: 'INSERT INTO admin (usuario, senha_hash, senha_trocada, papel) VALUES (?, ?, 0, ?)',
    args: [String(usuario).trim(), hash, papel],
  });
}

async function buscarAdminPorUsuario(usuario) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM admin WHERE lower(usuario) = lower(?)',
    args: [String(usuario).trim()],
  });
  return rows[0] || null;
}

async function verificarLogin(usuario, senha) {
  const admin = await buscarAdminPorUsuario(usuario);
  if (!admin) return null;
  const confere = bcrypt.compareSync(String(senha), admin.senha_hash);
  return confere ? admin : null;
}

async function trocarSenha(usuario, novaSenha) {
  const hash = bcrypt.hashSync(novaSenha, 10);
  await db.execute({
    sql: "UPDATE admin SET senha_hash = ?, senha_trocada = 1, atualizado_em = datetime('now','-3 hours') WHERE lower(usuario) = lower(?)",
    args: [hash, String(usuario).trim()],
  });
}

async function conferirSenhaAtual(usuario, senha) {
  const admin = await buscarAdminPorUsuario(usuario);
  if (!admin) return false;
  return bcrypt.compareSync(String(senha), admin.senha_hash);
}

function exigirLogin(req, res, next) {
  if (req.session && req.session.adminLogado) return next();
  return res.status(401).json({ erro: 'Sessão expirada ou não autenticada. Faça login novamente.' });
}

// Ações que alteram dados (cancelar, excluir, reenviar e-mail, prazo) exigem
// papel 'admin'; contas 'leitor' só consultam, filtram e imprimem. O papel é
// lido do banco a cada chamada, então mudar a conta vale na hora.
async function exigirAdminCompleto(req, res, next) {
  try {
    const admin = await buscarAdminPorUsuario(req.session.adminUsuario);
    if (admin && admin.papel === 'admin') return next();
    return res.status(403).json({ erro: 'Seu acesso é somente de consulta. Essa ação não é permitida.' });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  seedAdminSeNecessario,
  criarAdmin,
  buscarAdminPorUsuario,
  verificarLogin,
  trocarSenha,
  conferirSenhaAtual,
  exigirLogin,
  exigirAdminCompleto,
};
