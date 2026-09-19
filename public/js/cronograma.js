// As duas primeiras etapas seguem o prazo real das inscrições (definido pelo
// admin no painel). O texto fixo do HTML serve de padrão se a consulta falhar.
(async function () {
  try {
    const resp = await fetch('/api/inscricoes/status');
    if (!resp.ok) return;
    const { aberto, prazo } = await resp.json();
    const fim = new Date(prazo);
    const fuso = { timeZone: 'America/Sao_Paulo' };

    const partes = new Intl.DateTimeFormat('pt-BR', { ...fuso, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(fim);
    const pegar = (tipo) => partes.find((p) => p.type === tipo).value;
    const dia = pegar('day');
    const mes = pegar('month');
    const hora = `${pegar('hour')}h${pegar('minute')}`;

    const dataInscricoes = document.getElementById('cron-inscricoes-data');
    const encerramento = document.getElementById('cron-encerramento');
    const dataEncerramento = document.getElementById('cron-encerramento-data');
    const textoEncerramento = document.getElementById('cron-encerramento-texto');

    if (fim.getFullYear() >= 2099) {
      dataInscricoes.textContent = 'A partir de 14 de setembro';
      dataEncerramento.textContent = 'A definir';
      textoEncerramento.textContent = 'A data de encerramento das inscrições será divulgada em breve.';
      return;
    }

    dataInscricoes.textContent = mes === 'setembro' ? `14 a ${dia} de setembro` : `14 de setembro a ${dia} de ${mes}`;
    dataEncerramento.textContent = `${dia} de ${mes}`;
    textoEncerramento.textContent = aberto
      ? `As inscrições serão encerradas às ${hora}. Após esse horário, não será possível realizar novas inscrições.`
      : `As inscrições foram encerradas às ${hora}. Não é mais possível realizar novas inscrições.`;
    encerramento.hidden = false;
  } catch (e) {
    // Mantém o texto padrão do HTML.
  }
})();
