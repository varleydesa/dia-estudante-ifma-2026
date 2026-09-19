const nodemailer = require('nodemailer');

const remetente = process.env.BREVO_REMETENTE;

function criarTransporter(host) {
  if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.BREVO_SMTP_PORT) || 2525,
    secure: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
      user: process.env.BREVO_SMTP_LOGIN,
      pass: process.env.BREVO_SMTP_KEY,
    },
  });
}

// Tenta primeiro o host oficial; em alguns momentos "smtp-relay.brevo.com"
// resolve para um servidor cujo certificado TLS só cobre os nomes legados
// ("sendinblue.com", nome antigo da Brevo), derrubando o envio — nesse caso,
// cai para o host legado antes de desistir.
const transporterPrincipal = criarTransporter('smtp-relay.brevo.com');
const transporterLegado = criarTransporter('smtp-relay.sendinblue.com');

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

// Envio pela API HTTPS da Brevo (porta 443). Serviços de hospedagem costumam
// bloquear as portas SMTP, mas não bloqueiam HTTPS.
async function enviarPorApi(mensagem, texto, html) {
  const resp = await fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Dia do Estudante 2026 - IFMA', email: remetente },
      to: [{ email: mensagem.to }],
      subject: mensagem.subject,
      textContent: texto,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`API da Brevo respondeu ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
}

// Nunca lança erro — quem chama decide se quer aguardar o resultado (ex: para
// registrar o status) ou disparar em segundo plano sem bloquear a resposta.
// Resolve para true/false conforme o e-mail foi entregue ou não.
async function enviarConfirmacaoInscricao(responsavel, registros, canceladasAnteriores, linkConsulta) {
  if (!process.env.BREVO_API_KEY && !transporterPrincipal) {
    console.warn('Nem BREVO_API_KEY nem BREVO_SMTP_LOGIN/BREVO_SMTP_KEY configurados — e-mail de confirmação não enviado.');
    return false;
  }

  const avisoTexto = canceladasAnteriores
    ? '\n\nObs.: sua(s) inscrição(ões) anterior(es) nessa(s) mesma(s) modalidade(s) foi(ram) substituída(s) por essa nova inscrição.'
    : '';
  const avisoHtml = canceladasAnteriores
    ? '<p><em>Obs.: sua(s) inscrição(ões) anterior(es) nessa(s) mesma(s) modalidade(s) foi(ram) substituída(s) por essa nova inscrição.</em></p>'
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

  const mensagem = {
    from: `"Dia do Estudante 2026 - IFMA" <${remetente}>`,
    to: responsavel.email,
    subject: 'Confirmação de inscrição — Dia do Estudante 2026',
    text: texto,
    html,
  };

  if (process.env.BREVO_API_KEY) {
    try {
      await enviarPorApi(mensagem, texto, html);
      return true;
    } catch (e0) {
      console.warn('Falha ao enviar pela API da Brevo, tentando SMTP:', e0.message);
    }
  }

  if (!transporterPrincipal) return false;

  try {
    await transporterPrincipal.sendMail(mensagem);
    return true;
  } catch (e1) {
    console.warn('Falha ao enviar via host principal, tentando host legado:', e1.message);
    try {
      await transporterLegado.sendMail(mensagem);
      return true;
    } catch (e2) {
      console.error('Falha ao enviar e-mail de confirmação (ambos os hosts):', e2.message);
      return false;
    }
  }
}

module.exports = { enviarConfirmacaoInscricao };
