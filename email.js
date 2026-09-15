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

function listarModalidades(registros) {
  return registros
    .map((r) => `- Nº ${String(r.id).padStart(3, '0')} — ${r.modalidade_nome}${r.categoria ? ` (${r.categoria})` : ''}${r.nome_equipe ? ` — time "${r.nome_equipe}"` : ''}`)
    .join('\n');
}

// Dispara em segundo plano e nunca lança erro — falha no envio não deve
// impedir nem atrasar a resposta da inscrição, que já foi salva com sucesso.
function enviarConfirmacaoInscricao(responsavel, registros, canceladasAnteriores) {
  if (!transporter) {
    console.warn('BREVO_SMTP_LOGIN/BREVO_SMTP_KEY não configurados — e-mail de confirmação não enviado.');
    return;
  }

  const avisoCancelamento = canceladasAnteriores
    ? '\n\nObs.: sua(s) inscrição(ões) anterior(es) foi(ram) cancelada(s) automaticamente por essa nova inscrição.'
    : '';

  const texto = `Olá, ${responsavel.nome_completo}!

Sua inscrição no Dia do Estudante 2026 (IFMA - Campus São Raimundo das Mangabeiras) foi confirmada nas seguintes modalidades:

${listarModalidades(registros)}${avisoCancelamento}

Fique atento ao congresso técnico da sua modalidade para mais informações sobre dia e horário.

Este é um e-mail automático de confirmação. Em caso de dúvidas, procure a organização do evento.`;

  transporter
    .sendMail({
      from: `"Dia do Estudante 2026 - IFMA" <${remetente}>`,
      to: responsavel.email,
      subject: 'Confirmação de inscrição — Dia do Estudante 2026',
      text: texto,
    })
    .catch((e) => console.error('Falha ao enviar e-mail de confirmação:', e.message));
}

module.exports = { enviarConfirmacaoInscricao };
