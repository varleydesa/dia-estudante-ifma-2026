require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { db, iniciar } = require('./db');
const auth = require('./auth');
const { enviarConfirmacaoInscricao } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const PRODUCAO = process.env.NODE_ENV === 'production';

const modalidades = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'modalidades.json'), 'utf-8')
);
const modalidadesPorId = new Map(modalidades.map((m) => [m.id, m]));

// Fuso fixo (-03:00) porque o Maranhão não tem horário de verão, independente
// de onde o servidor (Render) roda — assim a comparação de prazo não depende
// do fuso do host.
// Valor inicial; se o admin definir outro prazo no painel, ele fica guardado no
// banco (tabela "configuracoes") e prevalece sobre este.
let prazoInscricoes = new Date(process.env.INSCRICOES_PRAZO || '2026-09-18T23:59:59-03:00');

async function carregarPrazoSalvo() {
  const { rows } = await db.execute("SELECT valor FROM configuracoes WHERE chave = 'inscricoes_prazo'");
  if (rows.length > 0) {
    const data = new Date(rows[0].valor);
    if (!Number.isNaN(data.getTime())) prazoInscricoes = data;
  }
}

function inscricoesAbertas() {
  return Date.now() < prazoInscricoes.getTime();
}

function mensagemPrazoEncerrado() {
  const formatado = prazoInscricoes.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `As inscrições foram encerradas em ${formatado}. Não é mais possível enviar novas inscrições.`;
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(
  session({
    name: 'dia_estudante_sessao',
    secret: process.env.SESSION_SECRET || 'segredo-dev-troque-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: PRODUCAO,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// Envolve rotas async para encaminhar erros ao middleware de erro do Express.
const rota = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function contarInscricoesPorModalidade() {
  const { rows } = await db.execute(
    "SELECT modalidade_id, COUNT(*) AS total FROM inscricoes WHERE status != 'cancelada' GROUP BY modalidade_id"
  );
  const contagens = new Map();
  for (const linha of rows) contagens.set(linha.modalidade_id, Number(linha.total));
  return contagens;
}

app.get(
  '/api/modalidades',
  rota(async (req, res) => {
    const contagens = await contarInscricoesPorModalidade();
    const resposta = modalidades.map((m) => {
      if (!m.limiteVagas) return m;
      const vagasOcupadas = contagens.get(m.id) || 0;
      return { ...m, vagasOcupadas, lotado: vagasOcupadas >= m.limiteVagas };
    });
    res.json(resposta);
  })
);

app.get('/api/inscricoes/status', (req, res) => {
  res.json({ aberto: inscricoesAbertas(), prazo: prazoInscricoes.toISOString() });
});

function erro(res, status, mensagem) {
  return res.status(status).json({ erro: mensagem });
}

function textoValido(v, max = 200) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

// Barra entradas claramente erradas (e-mail, texto sem número) que colidiriam
// com a matrícula de outras pessoas nas checagens de duplicidade.
function matriculaValida(m) {
  return typeof m === 'string' && !m.includes('@') && (m.match(/\d/g) || []).length >= 5;
}

const MSG_MATRICULA = 'Matrícula inválida. Digite o número da matrícula completo (ex.: 20261AGRO.SRM0034).';

function validarResponsavel(responsavel) {
  if (!responsavel || typeof responsavel !== 'object') return 'Dados do responsável ausentes.';
  if (!textoValido(responsavel.nome_completo)) return 'Informe o nome completo do responsável.';
  if (!textoValido(responsavel.matricula, 50)) return 'Informe a matrícula do responsável.';
  if (!matriculaValida(responsavel.matricula)) return MSG_MATRICULA;
  if (!textoValido(responsavel.curso)) return 'Informe o curso do responsável.';
  if (!textoValido(responsavel.telefone, 30)) return 'Informe um telefone de contato.';
  if (!textoValido(responsavel.email, 120) || !responsavel.email.includes('@')) {
    return 'Informe um e-mail válido.';
  }
  if (!['Ensino Médio', 'Ensino Superior'].includes(responsavel.nivel)) {
    return 'Selecione o nível de ensino (Médio ou Superior).';
  }
  return null;
}

function validarAtleta(a) {
  if (!a || typeof a !== 'object') return 'Dados de atleta inválidos.';
  if (!textoValido(a.nome_completo)) return 'Informe o nome completo de todos os integrantes.';
  if (!textoValido(a.matricula, 50)) return 'Informe a matrícula de todos os integrantes.';
  if (!matriculaValida(a.matricula)) return `${MSG_MATRICULA} (integrante: ${String(a.nome_completo).trim()})`;
  return null;
}

function validarInscricao(item, responsavel) {
  const modalidade = modalidadesPorId.get(item.modalidade_id);
  if (!modalidade) return { erro: `Modalidade inválida: ${item.modalidade_id}` };

  const categoriasValidas = modalidade.categorias;
  let categoria = item.categoria;
  if (categoriasValidas.length === 1) {
    categoria = categoriasValidas[0];
  } else if (!categoriasValidas.includes(categoria)) {
    return { erro: `Selecione a categoria para ${modalidade.nome}.` };
  }

  let provas = null;
  if (modalidade.multiProva) {
    if (!Array.isArray(item.provas) || item.provas.length === 0) {
      return { erro: `Selecione ao menos uma prova para ${modalidade.nome}.` };
    }
    const invalidas = item.provas.filter((p) => !modalidade.provas.includes(p));
    if (invalidas.length > 0) {
      return { erro: `Prova inválida em ${modalidade.nome}: ${invalidas.join(', ')}` };
    }
    provas = JSON.stringify(item.provas);
  }

  const nivel = responsavel.nivel;

  const participantes = [];
  let nomeEquipe = null;

  if (modalidade.tipo === 'equipe') {
    if (!textoValido(item.nome_equipe, 100)) {
      return { erro: `Informe o nome do time para ${modalidade.nome}.` };
    }
    nomeEquipe = item.nome_equipe.trim();

    const atletas = Array.isArray(item.atletas) ? item.atletas : [];
    for (const a of atletas) {
      const erroAtleta = validarAtleta(a);
      if (erroAtleta) return { erro: `${modalidade.nome}: ${erroAtleta}` };
    }

    participantes.push({
      nome_completo: responsavel.nome_completo.trim(),
      matricula: responsavel.matricula.trim(),
      curso: responsavel.curso.trim(),
      telefone: responsavel.telefone.trim(),
      email: responsavel.email.trim(),
      capitao: 1,
      titular: modalidade.titulares ? 1 : null,
    });

    for (const a of atletas) {
      participantes.push({
        nome_completo: a.nome_completo.trim(),
        matricula: a.matricula.trim(),
        curso: textoValido(a.curso) ? a.curso.trim() : null,
        telefone: textoValido(a.telefone, 30) ? a.telefone.trim() : null,
        email: textoValido(a.email, 120) ? a.email.trim() : null,
        capitao: 0,
        titular: modalidade.titulares ? (a.titular ? 1 : 0) : null,
      });
    }

    const nomesNormalizados = participantes.map((p) => p.nome_completo.trim().toLowerCase());
    const nomeEquipeNormalizado = nomeEquipe.toLowerCase();
    if (nomesNormalizados.includes(nomeEquipeNormalizado)) {
      return { erro: `Em ${modalidade.nome}, o nome do time não pode ser igual ao nome de um integrante.` };
    }
    const nomeDuplicado = nomesNormalizados.some((n, i) => nomesNormalizados.indexOf(n) !== i);
    if (nomeDuplicado) {
      return { erro: `Em ${modalidade.nome}, há integrantes com o mesmo nome. Cada integrante deve ser uma pessoa diferente.` };
    }
    const matriculasNormalizadas = participantes.map((p) => p.matricula.trim().toLowerCase());
    const matriculaDuplicada = matriculasNormalizadas.some((mt, i) => matriculasNormalizadas.indexOf(mt) !== i);
    if (matriculaDuplicada) {
      return { erro: `Em ${modalidade.nome}, há integrantes com a mesma matrícula. Cada integrante deve ser uma pessoa diferente.` };
    }

    const total = participantes.length;
    if (modalidade.minAtletas && total < modalidade.minAtletas) {
      return { erro: `${modalidade.nome} exige no mínimo ${modalidade.minAtletas} integrantes (informado: ${total}).` };
    }
    if (modalidade.maxAtletas && total > modalidade.maxAtletas) {
      return { erro: `${modalidade.nome} permite no máximo ${modalidade.maxAtletas} integrantes (informado: ${total}).` };
    }
    if (modalidade.titulares) {
      const titulares = participantes.filter((p) => p.titular === 1).length;
      const reservas = participantes.filter((p) => p.titular === 0).length;
      if (titulares !== modalidade.titulares) {
        return { erro: `${modalidade.nome} exige exatamente ${modalidade.titulares} titulares (informado: ${titulares}).` };
      }
      if (reservas > modalidade.reservas) {
        return { erro: `${modalidade.nome} permite no máximo ${modalidade.reservas} reservas (informado: ${reservas}).` };
      }
    }
  } else {
    participantes.push({
      nome_completo: responsavel.nome_completo.trim(),
      matricula: responsavel.matricula.trim(),
      curso: responsavel.curso.trim(),
      telefone: responsavel.telefone.trim(),
      email: responsavel.email.trim(),
      capitao: 0,
      titular: null,
    });
  }

  return {
    registro: {
      modalidade_id: modalidade.id,
      modalidade_nome: modalidade.nome,
      tipo: modalidade.tipo,
      nivel,
      categoria,
      nome_equipe: nomeEquipe,
      provas,
      observacoes: textoValido(item.observacoes, 500) ? item.observacoes.trim() : null,
      participantes,
    },
  };
}

app.post(
  '/api/inscricoes',
  rota(async (req, res) => {
    if (!inscricoesAbertas()) {
      return erro(res, 403, mensagemPrazoEncerrado());
    }

    const { responsavel, inscricoes } = req.body || {};

    const erroResponsavel = validarResponsavel(responsavel);
    if (erroResponsavel) return erro(res, 400, erroResponsavel);

    if (!Array.isArray(inscricoes) || inscricoes.length === 0) {
      return erro(res, 400, 'Selecione ao menos uma modalidade.');
    }

    const idsEscolhidos = new Set();
    const registros = [];
    for (const item of inscricoes) {
      if (idsEscolhidos.has(item.modalidade_id)) {
        return erro(res, 400, `Modalidade repetida: ${item.modalidade_id}`);
      }
      idsEscolhidos.add(item.modalidade_id);

      const resultado = validarInscricao(item, responsavel);
      if (resultado.erro) return erro(res, 400, resultado.erro);
      registros.push(resultado.registro);
    }

    const tx = await db.transaction('write');
    try {
      // Um reenvio substitui apenas as inscrições anteriores ativas dessa mesma
      // pessoa (identificada pela matrícula) nas modalidades que ela está
      // enviando de novo — as demais permanecem intactas.
      const idsModalidades = registros.map((r) => r.modalidade_id);
      const { rows: anteriores } = await tx.execute({
        sql: `
          SELECT DISTINCT i.id
          FROM inscricoes i
          JOIN participantes p ON p.inscricao_id = i.id
          WHERE i.status != 'cancelada'
            AND LOWER(TRIM(p.matricula)) = LOWER(?)
            AND (p.capitao = 1 OR i.tipo = 'individual')
            AND i.modalidade_id IN (${idsModalidades.map(() => '?').join(',')})
        `,
        args: [responsavel.matricula.trim(), ...idsModalidades],
      });
      for (const anterior of anteriores) {
        await tx.execute({ sql: "UPDATE inscricoes SET status = 'cancelada' WHERE id = ?", args: [anterior.id] });
      }

      // Token aleatório e imprevisível (não é o Nº sequencial) usado no link
      // de consulta pública do e-mail de confirmação — não tem relação
      // nenhuma com login/sessão do admin.
      const tokenConsulta = crypto.randomBytes(16).toString('hex');

      const idsGerados = [];
      for (const registro of registros) {
        const modalidade = modalidadesPorId.get(registro.modalidade_id);

        if (registro.tipo === 'equipe') {
          const matriculas = registro.participantes.map((p) => p.matricula.trim().toLowerCase());
          const placeholders = matriculas.map(() => '?').join(',');
          const { rows: conflitos } = await tx.execute({
            sql: `
              SELECT DISTINCT p.nome_completo, i.nome_equipe
              FROM inscricoes i
              JOIN participantes p ON p.inscricao_id = i.id
              WHERE i.modalidade_id = ?
                AND i.status != 'cancelada'
                AND LOWER(TRIM(p.matricula)) IN (${placeholders})
            `,
            args: [registro.modalidade_id, ...matriculas],
          });
          if (conflitos.length > 0) {
            await tx.rollback();
            const nomes = conflitos.map((c) => `${c.nome_completo} (já no time "${c.nome_equipe}")`).join(', ');
            return erro(res, 409, `${modalidade.nome}: já existe integrante cadastrado em outro time ativo — ${nomes}.`);
          }
        }

        if (modalidade.limiteVagas) {
          const { rows } = await tx.execute({
            sql: "SELECT COUNT(*) AS total FROM inscricoes WHERE modalidade_id = ? AND status != 'cancelada'",
            args: [modalidade.id],
          });
          if (Number(rows[0].total) >= modalidade.limiteVagas) {
            await tx.rollback();
            return erro(res, 409, `As vagas de "${modalidade.nome}" já foram preenchidas.`);
          }
        }

        const resultado = await tx.execute({
          sql: `INSERT INTO inscricoes (modalidade_id, modalidade_nome, tipo, nivel, categoria, nome_equipe, provas, observacoes, token_consulta)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            registro.modalidade_id,
            registro.modalidade_nome,
            registro.tipo,
            registro.nivel,
            registro.categoria,
            registro.nome_equipe,
            registro.provas,
            registro.observacoes,
            tokenConsulta,
          ],
        });
        const inscricaoId = Number(resultado.lastInsertRowid);
        idsGerados.push(inscricaoId);
        registro.id = inscricaoId;

        for (const p of registro.participantes) {
          await tx.execute({
            sql: `INSERT INTO participantes (inscricao_id, nome_completo, matricula, curso, telefone, email, capitao, titular)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [inscricaoId, p.nome_completo, p.matricula, p.curso, p.telefone, p.email, p.capitao, p.titular],
          });
        }
      }
      await tx.commit();
      const linkConsulta = `${req.protocol}://${req.get('host')}/consulta.html?token=${tokenConsulta}`;
      // Não aguarda o envio (não deve atrasar a resposta), mas registra o
      // resultado assim que souber, para o painel poder oferecer reenvio.
      enviarConfirmacaoInscricao(responsavel, registros, anteriores.length, linkConsulta)
        .then((sucesso) => atualizarEmailStatus(idsGerados, sucesso ? 'enviado' : 'falhou'))
        .catch(() => atualizarEmailStatus(idsGerados, 'falhou'));
      res.status(201).json({ ok: true, ids: idsGerados, canceladasAnteriores: anteriores.length });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  })
);

async function atualizarEmailStatus(ids, status) {
  for (const id of ids) {
    await db.execute({ sql: 'UPDATE inscricoes SET email_status = ? WHERE id = ?', args: [status, id] });
  }
}

// Reúne as inscrições ativas de uma pessoa (a partir da matrícula) no mesmo
// formato usado para montar o e-mail de confirmação — usado tanto no envio
// original quanto no reenvio manual pelo painel.
async function montarRegistrosAtivosPorMatricula(matricula, idInscricaoSeSemMatricula) {
  const { rows: inscricoes } = await db.execute({
    sql: `
      SELECT DISTINCT i.id, i.tipo, i.modalidade_nome, i.categoria, i.nome_equipe, i.token_consulta
      FROM inscricoes i
      JOIN participantes p ON p.inscricao_id = i.id
      WHERE LOWER(TRIM(p.matricula)) = LOWER(?)
        AND (p.capitao = 1 OR i.tipo = 'individual')
        AND i.status != 'cancelada'
        AND (TRIM(?) != '' OR i.id = ?)
      ORDER BY i.id ASC
    `,
    args: [matricula, matricula, idInscricaoSeSemMatricula ?? -1],
  });

  const registros = [];
  for (const insc of inscricoes) {
    const registro = {
      id: insc.id,
      tipo: insc.tipo,
      modalidade_nome: insc.modalidade_nome,
      categoria: insc.categoria,
      nome_equipe: insc.nome_equipe,
    };
    if (insc.tipo === 'equipe') {
      const { rows: participantes } = await db.execute({
        sql: 'SELECT nome_completo, capitao, titular FROM participantes WHERE inscricao_id = ? ORDER BY capitao DESC, id ASC',
        args: [insc.id],
      });
      registro.participantes = participantes;
    }
    registros.push(registro);
  }

  const tokenExistente = inscricoes.find((i) => i.token_consulta)?.token_consulta;
  return { registros, tokenExistente };
}

app.get(
  '/api/inscricoes/verificar-matricula',
  rota(async (req, res) => {
    const matricula = typeof req.query.matricula === 'string' ? req.query.matricula.trim() : '';
    if (!matricula) return res.json({ existe: false, modalidades: [] });

    const { rows } = await db.execute({
      sql: `
        SELECT DISTINCT i.modalidade_nome
        FROM inscricoes i
        JOIN participantes p ON p.inscricao_id = i.id
        WHERE i.status != 'cancelada'
          AND LOWER(TRIM(p.matricula)) = LOWER(?)
          AND (p.capitao = 1 OR i.tipo = 'individual')
      `,
      args: [matricula],
    });

    res.json({ existe: rows.length > 0, modalidades: rows.map((r) => r.modalidade_nome) });
  })
);

// Consulta pública (sem login) das próprias inscrições, a partir do link
// enviado por e-mail. O token é aleatório e só identifica a matrícula do
// dono da inscrição — nunca dá acesso a dados de outras pessoas nem a
// nenhuma rota/capacidade administrativa.
app.get(
  '/api/consulta/:token',
  rota(async (req, res) => {
    const token = req.params.token;
    if (!textoValido(token, 64)) return erro(res, 400, 'Link inválido.');

    const { rows: dono } = await db.execute({
      sql: `
        SELECT p.matricula, p.nome_completo
        FROM inscricoes i
        JOIN participantes p ON p.inscricao_id = i.id
        WHERE i.token_consulta = ? AND (p.capitao = 1 OR i.tipo = 'individual')
        LIMIT 1
      `,
      args: [token],
    });
    if (dono.length === 0) return erro(res, 404, 'Link inválido ou expirado.');

    const { rows } = await db.execute({
      sql: `
        SELECT DISTINCT i.id, i.tipo, i.modalidade_nome, i.nivel, i.categoria, i.nome_equipe, i.provas, i.status, i.criado_em
        FROM inscricoes i
        JOIN participantes p ON p.inscricao_id = i.id
        WHERE LOWER(TRIM(p.matricula)) = LOWER(?)
          AND (p.capitao = 1 OR i.tipo = 'individual')
          AND (TRIM(?) != '' OR i.token_consulta = ?)
        ORDER BY i.criado_em ASC
      `,
      args: [dono[0].matricula, dono[0].matricula, token],
    });

    const idsEquipe = rows.filter((r) => r.tipo === 'equipe').map((r) => r.id);
    const integrantesPorInscricao = new Map();
    if (idsEquipe.length > 0) {
      const placeholders = idsEquipe.map(() => '?').join(',');
      const { rows: integrantes } = await db.execute({
        sql: `
          SELECT inscricao_id, nome_completo, capitao, titular
          FROM participantes
          WHERE inscricao_id IN (${placeholders})
          ORDER BY capitao DESC, id ASC
        `,
        args: idsEquipe,
      });
      for (const p of integrantes) {
        if (!integrantesPorInscricao.has(p.inscricao_id)) integrantesPorInscricao.set(p.inscricao_id, []);
        const papel = p.capitao ? 'Capitão(ã)' : p.titular === 1 ? 'Titular' : p.titular === 0 ? 'Reserva' : null;
        integrantesPorInscricao.get(p.inscricao_id).push({ nome_completo: p.nome_completo, papel });
      }
    }

    res.json({
      nome: dono[0].nome_completo,
      inscricoes: rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        modalidade_nome: r.modalidade_nome,
        nivel: r.nivel,
        categoria: r.categoria,
        nome_equipe: r.nome_equipe,
        provas: r.provas ? JSON.parse(r.provas) : null,
        status: r.status,
        criado_em: r.criado_em,
        integrantes: integrantesPorInscricao.get(r.id) || null,
      })),
    });
  })
);

// ---------- Autenticação do admin ----------

app.post(
  '/api/admin/login',
  rota(async (req, res) => {
    const { usuario, senha } = req.body || {};
    if (!textoValido(usuario, 150) || !textoValido(senha, 200)) {
      return erro(res, 400, 'Informe usuário e senha.');
    }

    const admin = await auth.verificarLogin(usuario, senha);
    if (!admin) {
      return erro(res, 401, 'Usuário ou senha inválidos.');
    }

    req.session.adminLogado = true;
    req.session.adminUsuario = admin.usuario;
    res.json({ ok: true, precisaTrocarSenha: admin.senha_trocada === 0 });
  })
);

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dia_estudante_sessao');
    res.json({ ok: true });
  });
});

app.get(
  '/api/admin/me',
  auth.exigirLogin,
  rota(async (req, res) => {
    const admin = await auth.buscarAdminPorUsuario(req.session.adminUsuario);
    res.json({
      usuario: req.session.adminUsuario,
      precisaTrocarSenha: !admin || admin.senha_trocada === 0,
    });
  })
);

app.post(
  '/api/admin/trocar-senha',
  auth.exigirLogin,
  rota(async (req, res) => {
    const { senhaAtual, novaSenha, confirmarSenha } = req.body || {};

    if (!textoValido(senhaAtual, 200) || !(await auth.conferirSenhaAtual(req.session.adminUsuario, senhaAtual))) {
      return erro(res, 400, 'Senha atual incorreta.');
    }
    if (!textoValido(novaSenha, 200) || novaSenha.length < 8) {
      return erro(res, 400, 'A nova senha deve ter pelo menos 8 caracteres.');
    }
    if (novaSenha !== confirmarSenha) {
      return erro(res, 400, 'A confirmação não confere com a nova senha.');
    }

    await auth.trocarSenha(req.session.adminUsuario, novaSenha);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/inscricoes/:id',
  auth.exigirLogin,
  rota(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return erro(res, 400, 'ID inválido.');
    }

    const { senha } = req.body || {};
    if (!textoValido(senha, 200) || !(await auth.conferirSenhaAtual(req.session.adminUsuario, senha))) {
      return erro(res, 403, 'Senha incorreta.');
    }

    await db.execute({ sql: 'DELETE FROM participantes WHERE inscricao_id = ?', args: [id] });
    const resultado = await db.execute({ sql: 'DELETE FROM inscricoes WHERE id = ?', args: [id] });

    if (resultado.rowsAffected === 0) {
      return erro(res, 404, 'Inscrição não encontrada.');
    }
    res.json({ ok: true });
  })
);

app.patch(
  '/api/admin/inscricoes/:id/status',
  auth.exigirLogin,
  rota(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return erro(res, 400, 'ID inválido.');
    }

    const { status } = req.body || {};
    if (!['ativa', 'cancelada'].includes(status)) {
      return erro(res, 400, 'Status inválido.');
    }

    const resultado = await db.execute({ sql: 'UPDATE inscricoes SET status = ? WHERE id = ?', args: [status, id] });
    if (resultado.rowsAffected === 0) {
      return erro(res, 404, 'Inscrição não encontrada.');
    }
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/inscricoes/:id/reenviar-email',
  auth.exigirLogin,
  rota(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return erro(res, 400, 'ID inválido.');

    const { rows: dono } = await db.execute({
      sql: `
        SELECT p.matricula, p.nome_completo, p.email
        FROM inscricoes i
        JOIN participantes p ON p.inscricao_id = i.id
        WHERE i.id = ? AND (p.capitao = 1 OR i.tipo = 'individual')
        LIMIT 1
      `,
      args: [id],
    });
    if (dono.length === 0) return erro(res, 404, 'Inscrição não encontrada.');
    const responsavel = dono[0];
    if (!textoValido(responsavel.email, 120) || !responsavel.email.includes('@')) {
      return erro(res, 400, 'Essa inscrição não tem e-mail válido cadastrado.');
    }

    const { registros, tokenExistente } = await montarRegistrosAtivosPorMatricula(responsavel.matricula, id);
    if (registros.length === 0) return erro(res, 404, 'Nenhuma inscrição ativa encontrada para reenviar.');

    const token = tokenExistente || crypto.randomBytes(16).toString('hex');
    const idsAtualizados = registros.map((r) => r.id);
    for (const registroId of idsAtualizados) {
      await db.execute({ sql: 'UPDATE inscricoes SET token_consulta = ? WHERE id = ?', args: [token, registroId] });
    }

    const linkConsulta = `${req.protocol}://${req.get('host')}/consulta.html?token=${token}`;
    const sucesso = await enviarConfirmacaoInscricao(responsavel, registros, 0, linkConsulta);
    await atualizarEmailStatus(idsAtualizados, sucesso ? 'enviado' : 'falhou');

    if (!sucesso) return erro(res, 502, 'Não foi possível enviar o e-mail. Tente novamente mais tarde.');
    res.json({ ok: true, idsAtualizados });
  })
);

// ---------- Consulta das inscrições (protegida) ----------

async function carregarInscricoes() {
  const { rows } = await db.execute(`
    SELECT
      i.id, i.modalidade_id, i.modalidade_nome, i.tipo, i.nivel, i.categoria,
      i.nome_equipe, i.provas, i.observacoes, i.status, i.email_status, i.criado_em,
      p.id AS participante_id, p.nome_completo, p.matricula, p.curso,
      p.telefone AS participante_telefone, p.email AS participante_email,
      p.capitao, p.titular
    FROM inscricoes i
    LEFT JOIN participantes p ON p.inscricao_id = i.id
    ORDER BY i.criado_em ASC, p.capitao DESC, p.id ASC
  `);

  const porInscricao = new Map();
  for (const linha of rows) {
    if (!porInscricao.has(linha.id)) {
      porInscricao.set(linha.id, {
        id: linha.id,
        modalidade_id: linha.modalidade_id,
        modalidade_nome: linha.modalidade_nome,
        tipo: linha.tipo,
        nivel: linha.nivel,
        categoria: linha.categoria,
        nome_equipe: linha.nome_equipe,
        provas: linha.provas ? JSON.parse(linha.provas) : null,
        observacoes: linha.observacoes,
        status: linha.status,
        email_status: linha.email_status,
        criado_em: linha.criado_em,
        participantes: [],
      });
    }
    if (linha.participante_id !== null) {
      porInscricao.get(linha.id).participantes.push({
        id: linha.participante_id,
        nome_completo: linha.nome_completo,
        matricula: linha.matricula,
        curso: linha.curso,
        telefone: linha.participante_telefone,
        email: linha.participante_email,
        capitao: linha.capitao,
        titular: linha.titular,
      });
    }
  }
  return Array.from(porInscricao.values());
}

app.get(
  '/api/admin/inscricoes',
  auth.exigirLogin,
  rota(async (req, res) => {
    res.json(await carregarInscricoes());
  })
);

function filtrarInscricoes(inscricoes, { modalidadeId, nivel, busca }) {
  return inscricoes.filter((inscricao) => {
    if (modalidadeId && inscricao.modalidade_id !== modalidadeId) return false;
    if (nivel && inscricao.nivel !== nivel) return false;
    if (busca) {
      const nomeEquipeCorresponde = (inscricao.nome_equipe || '').toLowerCase().includes(busca);
      const algumParticipanteCorresponde = inscricao.participantes.some(
        (p) =>
          p.nome_completo.toLowerCase().includes(busca) ||
          (p.matricula || '').toLowerCase().includes(busca)
      );
      if (!nomeEquipeCorresponde && !algumParticipanteCorresponde) return false;
    }
    return true;
  });
}

app.get(
  '/api/admin/inscricoes.csv',
  auth.exigirLogin,
  rota(async (req, res) => {
    const filtros = {
      modalidadeId: typeof req.query.modalidade === 'string' ? req.query.modalidade : '',
      nivel: typeof req.query.nivel === 'string' ? req.query.nivel : '',
      busca: typeof req.query.busca === 'string' ? req.query.busca.trim().toLowerCase() : '',
    };

    const linhas = [
      ['Status', 'Modalidade', 'Tipo', 'Nível', 'Categoria', 'Time', 'Provas', 'Capitão', 'Titular/Reserva', 'Nome', 'Matrícula', 'Curso', 'Telefone', 'E-mail', 'Inscrito em'],
    ];

    const inscricoes = filtrarInscricoes(await carregarInscricoes(), filtros);
    for (const inscricao of inscricoes) {
      for (const p of inscricao.participantes) {
        linhas.push([
          inscricao.status === 'cancelada' ? 'Cancelada' : 'Ativa',
          inscricao.modalidade_nome,
          inscricao.tipo,
          inscricao.nivel || '',
          inscricao.categoria || '',
          inscricao.nome_equipe || '',
          inscricao.provas ? inscricao.provas.join(' / ') : '',
          p.capitao ? 'Sim' : 'Não',
          p.titular === null ? '' : p.titular ? 'Titular' : 'Reserva',
          p.nome_completo,
          p.matricula || '',
          p.curso || '',
          p.telefone || '',
          p.email || '',
          inscricao.criado_em,
        ]);
      }
    }

    const csv = linhas
      .map((linha) => linha.map((campo) => `"${String(campo).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inscricoes-dia-do-estudante-2026.csv"');
    res.send('﻿' + csv);
  })
);

// ---------- Prazo de inscrições (admin) ----------

app.get('/api/admin/prazo', auth.exigirLogin, (req, res) => {
  res.json({ aberto: inscricoesAbertas(), prazo: prazoInscricoes.toISOString() });
});

// Recebe "prazo" no formato "AAAA-MM-DDTHH:mm" (horário de Brasília, o mesmo
// valor de um campo datetime-local), "agora" para encerrar já ou "aberto"
// para reabrir sem data de encerramento automático.
app.put(
  '/api/admin/prazo',
  auth.exigirLogin,
  rota(async (req, res) => {
    const { prazo } = req.body || {};
    let novoPrazo;
    if (prazo === 'agora') {
      novoPrazo = new Date();
    } else if (prazo === 'aberto') {
      novoPrazo = new Date('2099-12-31T23:59:59-03:00');
    } else if (typeof prazo === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(prazo)) {
      novoPrazo = new Date(`${prazo}:59-03:00`);
    } else {
      return erro(res, 400, 'Informe uma data e hora válidas para o encerramento.');
    }
    if (Number.isNaN(novoPrazo.getTime())) return erro(res, 400, 'Data e hora inválidas.');

    await db.execute({
      sql: `INSERT INTO configuracoes (chave, valor) VALUES ('inscricoes_prazo', ?)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      args: [novoPrazo.toISOString()],
    });
    prazoInscricoes = novoPrazo;
    res.json({ aberto: inscricoesAbertas(), prazo: prazoInscricoes.toISOString() });
  })
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  erro(res, 500, 'Erro inesperado no servidor. Tente novamente.');
});

iniciar()
  .then(() => auth.seedAdminSeNecessario())
  .then(() => carregarPrazoSalvo())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Site do Dia do Estudante 2026 rodando em http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Falha ao iniciar o servidor:', e);
    process.exit(1);
  });
