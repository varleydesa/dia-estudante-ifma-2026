const nodemailer = require('nodemailer');

const remetente = process.env.BREVO_REMETENTE;

const transporter =
  process.env.BREVO_SMTP_LOGIN && process.env.BREVO_SMTP_KEY
    ? nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.BREVO_SMTP_LOGIN,
          pass: process.env.BREVO_SMTP_KEY,
        },
      })
    : null;

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function descricaoModalidade(r) {
  return `${r.modalidade_nome}${r.categoria ? ` (${r.categoria})` : ''}${r.nome_equipe ? ` — time "${r.nome_equipe}"` : ''}`;
}

function papelDe(p) {
  if (p.capitao) return 'Capitão(ã)';
  if (p.titular === true || p.titular === 1) return 'Titular';
  if (p.titular === false || p.titular === 0) return 'Reserva';
  return null;
}

function listarIntegrantes(participantes) {
  return participantes
    .map((p) => {
      const papel = papelDe(p);
      return papel ? `${p.nome_completo} (${papel})` : p.nome_completo;
    })
    .join(', ');
}

function listarModalidadesTexto(registros) {
  return registros
    .map((r) => {
      let linha = `- Nº ${String(r.id).padStart(3, '0')} — ${descricaoModalidade(r)}`;
      if (r.tipo === 'equipe' && r.participantes?.length) {
        linha += `\n  Integrantes: ${listarIntegrantes(r.participantes)}`;
      }
      return linha;
    })
    .join('\n');
}

function listarModalidadesHtml(registros) {
  return registros
    .map((r) => {
      let item = `<li><strong>Nº ${String(r.id).padStart(3, '0')}</strong> — ${escaparHtml(descricaoModalidade(r))}`;
      if (r.tipo === 'equipe' && r.participantes?.length) {
        item += `<br><span style="font-size:0.9em;color:#555">Integrantes: ${escaparHtml(listarIntegrantes(r.participantes))}</span>`;
      }
      item += '</li>';
      return item;
    })
    .join('');
}

// Dispara em segundo plano e nunca lança erro — falha no envio não deve
// impedir nem atrasar a resposta da inscrição, que já foi salva com sucesso.
function enviarConfirmacaoInscricao(responsavel, registros, canceladasAnteriores, linkConsulta) {
  if (!transporter) {
    console.warn('BREVO_SMTP_LOGIN/BREVO_SMTP_KEY não configurados — e-mail de confirmação não enviado.');
    return;
  }

  const avisoTexto = canceladasAnteriores
    ? '\n\nObs.: sua(s) inscrição(ões) anterior(es) foi(ram) cancelada(s) automaticamente por essa nova inscrição.'
    : '';
  const avisoHtml = canceladasAnteriores
    ? '<p><em>Obs.: sua(s) inscrição(ões) anterior(es) foi(ram) cancelada(s) automaticamente por essa nova inscrição.</em></p>'
    : '';

  const linkTexto = linkConsulta ? `\n\nPara ver o resumo completo da sua inscrição, acesse:\n${linkConsulta}` : '';
  const linkHtml = linkConsulta
    ? `<p><a href="${escaparHtml(linkConsulta)}">Ver o resumo completo da minha inscrição</a></p>`
    : '';

  const texto = `Olá, ${responsavel.nome_completo}!

Sua inscrição no Dia do Estudante 2026 (IFMA - Campus São Raimundo das Mangabeiras) foi confirmada nas seguintes modalidades:

${listarModalidadesTexto(registros)}${avisoTexto}${linkTexto}

Fique atento ao congresso técnico da sua modalidade para mais informações sobre dia e horário.

Este é um e-mail automático de confirmação. Em caso de dúvidas, procure a organização do evento.`;

  const html = `
    <p>Olá, ${escaparHtml(responsavel.nome_completo)}!</p>
    <p>Sua inscrição no Dia do Estudante 2026 (IFMA - Campus São Raimundo das Mangabeiras) foi confirmada nas seguintes modalidades:</p>
    <ul>${listarModalidadesHtml(registros)}</ul>
    ${avisoHtml}
    ${linkHtml}
    <p>Fique atento ao congresso técnico da sua modalidade para mais informações sobre dia e horário.</p>
    <p style="color:#666;font-size:0.85em">Este é um e-mail automático de confirmação. Em caso de dúvidas, procure a organização do evento.</p>
  `;

  transporter
    .sendMail({
      from: `"Dia do Estudante 2026 - IFMA" <${remetente}>`,
      to: responsavel.email,
      subject: 'Confirmação de inscrição — Dia do Estudante 2026',
      text: texto,
      html,
    })
    .catch((e) => console.error('Falha ao enviar e-mail de confirmação:', e.message));
}

module.exports = { enviarConfirmacaoInscricao };
