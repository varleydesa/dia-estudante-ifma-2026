(function () {
  const carregando = document.getElementById('carregando');
  const conteudo = document.getElementById('conteudo');
  const usuarioLogado = document.getElementById('usuario-logado');
  const resumoModalidades = document.getElementById('resumo-modalidades');
  const filtroModalidade = document.getElementById('filtro-modalidade');
  const filtroNivel = document.getElementById('filtro-nivel');
  const filtroBusca = document.getElementById('filtro-busca');
  const corpoTabela = document.getElementById('corpo-tabela');
  const tabelaElemento = document.querySelector('table.tabela-inscricoes');
  const contagemResultados = document.getElementById('contagem-resultados');
  const btnSair = document.getElementById('btn-sair');
  const linkCsv = document.getElementById('link-csv');
  const btnImprimir = document.getElementById('btn-imprimir');
  const filtroImpressao = document.getElementById('filtro-impressao');
  const modalExcluir = document.getElementById('modal-excluir');
  const descricaoExclusao = document.getElementById('descricao-exclusao');
  const senhaExclusao = document.getElementById('senha-confirmar-exclusao');
  const erroExclusao = document.getElementById('erro-exclusao');
  const btnCancelarExclusao = document.getElementById('btn-cancelar-exclusao');
  const btnConfirmarExclusao = document.getElementById('btn-confirmar-exclusao');

  let inscricoes = [];
  let modalidades = [];
  const gruposExpandidos = new Set();
  const detalhesExpandidos = new Set();
  const menusAcoesAbertos = new Set();
  let idParaExcluir = null;

  init();

  async function init() {
    try {
      const me = await fetch('/api/admin/me');
      if (me.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      const dadosMe = await me.json();
      if (dadosMe.precisaTrocarSenha) {
        window.location.href = 'trocar-senha.html?obrigatorio=1';
        return;
      }
      usuarioLogado.textContent = dadosMe.usuario;

      modalidades = await window.Modalidades.carregar();
      filtroModalidade.innerHTML += modalidades.map((m) => `<option value="${m.id}">${m.nome}</option>`).join('');

      const respInscricoes = await fetch('/api/admin/inscricoes');
      if (respInscricoes.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      inscricoes = await respInscricoes.json();

      renderResumo();
      renderTabela();

      carregando.style.display = 'none';
      conteudo.style.display = 'block';
    } catch (e) {
      carregando.textContent = 'Não foi possível carregar o painel. Recarregue a página.';
    }
  }

  function renderResumo() {
    const ativas = inscricoes.filter((i) => i.status !== 'cancelada');

    const contagemPorModalidade = new Map();
    for (const i of ativas) {
      contagemPorModalidade.set(i.modalidade_nome, (contagemPorModalidade.get(i.modalidade_nome) || 0) + 1);
    }

    const totalParticipantes = ativas.reduce((soma, i) => soma + i.participantes.length, 0);

    const cartoes = [
      `<div class="cartao-resumo"><span class="numero">${ativas.length}</span><span class="rotulo-resumo">Inscrições registradas</span></div>`,
      `<div class="cartao-resumo"><span class="numero">${totalParticipantes}</span><span class="rotulo-resumo">Participantes no total</span></div>`,
    ];

    const porModalidadeOrdenado = Array.from(contagemPorModalidade).sort((a, b) => b[1] - a[1]);
    for (const [nome, qtd] of porModalidadeOrdenado) {
      cartoes.push(`<div class="cartao-resumo"><span class="numero">${qtd}</span><span class="rotulo-resumo">${nome}</span></div>`);
    }

    resumoModalidades.innerHTML = cartoes.join('');
  }

  // Retorna as inscrições que passam pelos filtros, junto com a lista de
  // participantes que bateram com a busca (usada para decidir o que expandir).
  function gruposFiltrados() {
    const modalidadeSelecionada = filtroModalidade.value;
    const nivelSelecionado = filtroNivel.value;
    const busca = filtroBusca.value.trim().toLowerCase();

    const grupos = [];
    for (const inscricao of inscricoes) {
      if (modalidadeSelecionada && inscricao.modalidade_id !== modalidadeSelecionada) continue;
      if (nivelSelecionado && inscricao.nivel !== nivelSelecionado) continue;

      let participantesCorrespondentes = inscricao.participantes;
      let equipeCorresponde = true;

      if (busca) {
        const nomeEquipeCorresponde = (inscricao.nome_equipe || '').toLowerCase().includes(busca);
        participantesCorrespondentes = inscricao.participantes.filter(
          (p) =>
            p.nome_completo.toLowerCase().includes(busca) ||
            (p.matricula || '').toLowerCase().includes(busca)
        );
        equipeCorresponde = nomeEquipeCorresponde || participantesCorrespondentes.length > 0;
        if (!equipeCorresponde) continue;
        // Se bateu só pelo nome da equipe, mostra todo mundo ao expandir.
        if (participantesCorrespondentes.length === 0) participantesCorrespondentes = inscricao.participantes;
      }

      grupos.push({ inscricao, participantesCorrespondentes, buscaAtiva: !!busca });
    }
    return grupos;
  }

  function papelDe(p) {
    let papel = '';
    if (p.capitao) papel += '<span class="emblema capitao">Capitão(ã)</span> ';
    if (p.titular === 1) papel += '<span class="emblema titular">Titular</span>';
    if (p.titular === 0) papel += '<span class="emblema reserva">Reserva</span>';
    return papel || '—';
  }

  function botaoExcluirIcone(inscricao, descricao) {
    return `<button type="button" class="btn-icone perigo" data-excluir="${inscricao.id}" data-descricao="${descricao.replace(/"/g, '&quot;')}" title="Excluir" aria-label="Excluir">✕</button>`;
  }

  function botaoExcluirTexto(inscricao, descricao) {
    return `<button type="button" class="item-menu-acao perigo" data-excluir="${inscricao.id}" data-descricao="${descricao.replace(/"/g, '&quot;')}">Excluir</button>`;
  }

  function botaoStatusIcone(inscricao) {
    const cancelada = inscricao.status === 'cancelada';
    const proximo = cancelada ? 'ativa' : 'cancelada';
    const rotulo = cancelada ? 'Reativar' : 'Cancelar';
    const simbolo = cancelada ? '↺' : '⏸';
    return `<button type="button" class="btn-icone" data-status-toggle="${inscricao.id}" data-proximo-status="${proximo}" title="${rotulo}" aria-label="${rotulo}">${simbolo}</button>`;
  }

  function botaoStatusTexto(inscricao) {
    const cancelada = inscricao.status === 'cancelada';
    const proximo = cancelada ? 'ativa' : 'cancelada';
    const rotulo = cancelada ? 'Reativar' : 'Cancelar';
    return `<button type="button" class="item-menu-acao" data-status-toggle="${inscricao.id}" data-proximo-status="${proximo}">${rotulo}</button>`;
  }

  // Ícones lado a lado em telas largas; em telas estreitas, some por trás de
  // um botão "⋮" que abre uma linha abaixo com as ações por extenso.
  function celulaAcoes(inscricao, descricao) {
    const aberto = menusAcoesAbertos.has(inscricao.id);
    return `
      <div class="acoes-icones">
        ${botaoStatusIcone(inscricao)}
        ${botaoExcluirIcone(inscricao, descricao)}
      </div>
      <button type="button" class="btn-icone acoes-menu-botao" data-menu-acoes="${inscricao.id}" aria-expanded="${aberto}" title="Ações" aria-label="Ações">⋮</button>
    `;
  }

  function linhaMenuAcoes(inscricao, descricao) {
    if (!menusAcoesAbertos.has(inscricao.id)) return '';
    return `
      <tr class="linha-menu-acoes">
        <td colspan="16">
          <div class="menu-acoes-mobile">
            ${botaoStatusTexto(inscricao)}
            ${botaoExcluirTexto(inscricao, descricao)}
          </div>
        </td>
      </tr>
    `;
  }

  function statusBadge(inscricao) {
    return inscricao.status === 'cancelada' ? '<span class="emblema cancelada">Cancelada</span>' : 'Ativa';
  }

  function classeLinha(inscricao, extra = '') {
    const classes = [extra, inscricao.status === 'cancelada' ? 'linha-cancelada' : ''].filter(Boolean);
    return classes.length ? ` class="${classes.join(' ')}"` : '';
  }

  function botaoDetalhe(chave, expandido) {
    return `<button type="button" class="botao-expandir" data-toggle-detalhe="${chave}" aria-expanded="${expandido}" title="Ver detalhes">${expandido ? '▾' : '▸'}</button>`;
  }

  // Cartão com todos os campos empilhados verticalmente, para conferir uma
  // inscrição sem precisar rolar a tabela para o lado.
  function linhaCartaoDetalhe(inscricao, p) {
    const campos = [
      ['Status', inscricao.status === 'cancelada' ? 'Cancelada' : 'Ativa'],
      ['Modalidade', inscricao.modalidade_nome],
      ['Nível', inscricao.nivel || '—'],
      ['Categoria', inscricao.categoria || '—'],
      ['Nome', p.nome_completo],
      ['Papel', papelDe(p)],
      ['Time', inscricao.nome_equipe || '—'],
      ['Matrícula', p.matricula || '—'],
      ['Curso', p.curso || '—'],
      ['Telefone', p.telefone || '—'],
      ['E-mail', p.email || '—'],
      ['Provas', inscricao.provas ? inscricao.provas.join(', ') : '—'],
      ['Inscrito em', inscricao.criado_em],
    ];
    const avisoReenvio =
      inscricao.email_status === 'falhou'
        ? `<button type="button" class="link-reenviar-email" data-reenviar-email="${inscricao.id}">O e-mail de confirmação não foi entregue — reenviar</button>`
        : '';
    return `
      <tr class="linha-cartao">
        <td colspan="16">
          <div class="cartao-detalhe">
            ${campos.map(([rotulo, valor]) => `<div class="item-detalhe"><span class="rotulo-detalhe">${rotulo}</span><span>${valor}</span></div>`).join('')}
            ${avisoReenvio}
          </div>
        </td>
      </tr>
    `;
  }

  // Salvaguarda: uma inscrição sem nenhum participante não deveria existir,
  // mas se acontecer (ex: inconsistência de dados), mostra uma linha própria
  // em vez de travar a tabela inteira tentando ler um participante inexistente.
  function linhaSemParticipantes(inscricao) {
    return `
      <tr${classeLinha(inscricao)}>
        <td>${inscricao.id}</td>
        <td></td>
        <td>${statusBadge(inscricao)}</td>
        <td>${inscricao.modalidade_nome}</td>
        <td>${inscricao.nivel || '—'}</td>
        <td>${inscricao.categoria || '—'}</td>
        <td>—</td>
        <td style="color:var(--erro)">Sem dados de participante registrados.</td>
        <td>${inscricao.nome_equipe || '—'}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>${inscricao.provas ? inscricao.provas.join(', ') : '—'}</td>
        <td>${inscricao.criado_em}</td>
        <td>${celulaAcoes(inscricao, `${inscricao.modalidade_nome} (sem participantes)`)}</td>
      </tr>
      ${linhaMenuAcoes(inscricao, `${inscricao.modalidade_nome} (sem participantes)`)}
    `;
  }

  function linhaParticipante(inscricao, p, { indentada } = {}) {
    const chave = `p${p.id}`;
    const expandido = detalhesExpandidos.has(chave);
    const linha = `
      <tr${classeLinha(inscricao, indentada ? 'linha-detalhe' : '')}>
        <td>${indentada ? '' : inscricao.id}</td>
        <td>${botaoDetalhe(chave, expandido)}</td>
        <td>${indentada ? '' : statusBadge(inscricao)}</td>
        <td>${inscricao.modalidade_nome}</td>
        <td>${inscricao.nivel || '—'}</td>
        <td>${inscricao.categoria || '—'}</td>
        <td>${p.nome_completo}</td>
        <td>${papelDe(p)}</td>
        <td>${inscricao.nome_equipe || '—'}</td>
        <td>${p.matricula || '—'}</td>
        <td>${p.curso || '—'}</td>
        <td>${p.telefone || '—'}</td>
        <td>${p.email || '—'}</td>
        <td>${inscricao.provas ? inscricao.provas.join(', ') : '—'}</td>
        <td>${inscricao.criado_em}</td>
        <td>${indentada ? '' : celulaAcoes(inscricao, `${inscricao.modalidade_nome} — ${p.nome_completo}`)}</td>
      </tr>
      ${!indentada ? linhaMenuAcoes(inscricao, `${inscricao.modalidade_nome} — ${p.nome_completo}`) : ''}
    `;
    return expandido ? linha + linhaCartaoDetalhe(inscricao, p) : linha;
  }

  function renderTabela() {
    const grupos = gruposFiltrados();

    const totalParticipantesExibidos = grupos.reduce(
      (soma, g) => soma + (g.buscaAtiva ? g.participantesCorrespondentes.length : g.inscricao.participantes.length),
      0
    );
    contagemResultados.textContent = `${grupos.length} inscrição(ões) · ${totalParticipantesExibidos} participante(s) encontrado(s).`;

    // Colunas só fazem sentido se algo na lista atual (já filtrada) usa esse
    // dado — Papel/Time são exclusivos de modalidades coletivas, e Provas é
    // exclusivo do Atletismo. Aplica tanto na tela quanto na impressão.
    const temColetiva = grupos.some((g) => g.inscricao.tipo === 'equipe');
    const temProvas = grupos.some((g) => g.inscricao.provas);
    tabelaElemento.classList.toggle('sem-coletiva', !temColetiva);
    tabelaElemento.classList.toggle('sem-provas', !temProvas);

    const linhas = [];

    for (const { inscricao, buscaAtiva } of grupos) {
      if (inscricao.participantes.length === 0) {
        linhas.push(linhaSemParticipantes(inscricao));
        continue;
      }

      const ehEquipe = inscricao.tipo === 'equipe' && inscricao.participantes.length > 1;

      if (!ehEquipe) {
        linhas.push(linhaParticipante(inscricao, inscricao.participantes[0]));
        continue;
      }

      const expandido = buscaAtiva || gruposExpandidos.has(inscricao.id);
      const capitao = inscricao.participantes.find((p) => p.capitao) || inscricao.participantes[0];

      linhas.push(`
        <tr${classeLinha(inscricao, 'linha-grupo')} data-toggle-grupo="${inscricao.id}">
          <td>${inscricao.id}</td>
          <td><button type="button" class="botao-expandir" aria-expanded="${expandido}">${expandido ? '▾' : '▸'}</button></td>
          <td>${statusBadge(inscricao)}</td>
          <td>${inscricao.modalidade_nome}</td>
          <td>${inscricao.nivel || '—'}</td>
          <td>${inscricao.categoria || '—'}</td>
          <td>${capitao.nome_completo} <span class="emblema capitao">Capitão(ã)</span></td>
          <td>${inscricao.participantes.length} integrante(s)</td>
          <td>${inscricao.nome_equipe || '—'}</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>${inscricao.provas ? inscricao.provas.join(', ') : '—'}</td>
          <td>${inscricao.criado_em}</td>
          <td>${celulaAcoes(inscricao, `${inscricao.modalidade_nome} — ${inscricao.nome_equipe}`)}</td>
        </tr>
        ${linhaMenuAcoes(inscricao, `${inscricao.modalidade_nome} — ${inscricao.nome_equipe}`)}
      `);

      if (expandido) {
        for (const p of inscricao.participantes) {
          linhas.push(linhaParticipante(inscricao, p, { indentada: true }));
        }
      }
    }

    corpoTabela.innerHTML = linhas.join('');
    atualizarFiltrosDerivados();
  }

  function descricaoFiltroAtivo() {
    const partes = [];
    if (filtroModalidade.value) {
      const m = window.Modalidades.porId(modalidades, filtroModalidade.value);
      partes.push(`Modalidade: ${m ? m.nome : filtroModalidade.value}`);
    }
    if (filtroNivel.value) partes.push(`Nível: ${filtroNivel.value}`);
    if (filtroBusca.value.trim()) partes.push(`Busca: "${filtroBusca.value.trim()}"`);
    return partes.join(' · ');
  }

  function atualizarFiltrosDerivados() {
    const params = new URLSearchParams();
    if (filtroModalidade.value) params.set('modalidade', filtroModalidade.value);
    if (filtroNivel.value) params.set('nivel', filtroNivel.value);
    if (filtroBusca.value.trim()) params.set('busca', filtroBusca.value.trim());

    const query = params.toString();
    linkCsv.href = query ? `/api/admin/inscricoes.csv?${query}` : '/api/admin/inscricoes.csv';
    linkCsv.textContent = query ? 'Exportar CSV (filtrado)' : 'Exportar CSV (tudo)';

    const descricao = descricaoFiltroAtivo();
    filtroImpressao.textContent = descricao
      ? `Filtro aplicado: ${descricao} — gerado em ${new Date().toLocaleString('pt-BR')}`
      : `Lista completa — gerado em ${new Date().toLocaleString('pt-BR')}`;
  }

  corpoTabela.addEventListener('click', async (evento) => {
    const botaoExcluirClicado = evento.target.closest('[data-excluir]');
    if (botaoExcluirClicado) {
      abrirModalExclusao(Number(botaoExcluirClicado.dataset.excluir), botaoExcluirClicado.dataset.descricao);
      return;
    }

    const botaoStatusClicado = evento.target.closest('[data-status-toggle]');
    if (botaoStatusClicado) {
      const id = Number(botaoStatusClicado.dataset.statusToggle);
      const novoStatus = botaoStatusClicado.dataset.proximoStatus;
      botaoStatusClicado.disabled = true;
      try {
        const resp = await fetch(`/api/admin/inscricoes/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: novoStatus }),
        });
        if (!resp.ok) throw new Error('Falha ao atualizar status.');
        const inscricao = inscricoes.find((i) => i.id === id);
        if (inscricao) inscricao.status = novoStatus;
        menusAcoesAbertos.delete(id);
        renderResumo();
        renderTabela();
      } catch (e) {
        alert('Não foi possível atualizar o status. Tente novamente.');
        botaoStatusClicado.disabled = false;
      }
      return;
    }

    const botaoReenviarEmail = evento.target.closest('[data-reenviar-email]');
    if (botaoReenviarEmail) {
      const id = Number(botaoReenviarEmail.dataset.reenviarEmail);
      botaoReenviarEmail.disabled = true;
      botaoReenviarEmail.textContent = 'Reenviando…';
      try {
        const resp = await fetch(`/api/admin/inscricoes/${id}/reenviar-email`, { method: 'POST' });
        const dados = await resp.json();
        if (!resp.ok) throw new Error(dados.erro || 'Falha ao reenviar.');
        for (const idAtualizado of dados.idsAtualizados || [id]) {
          const inscricao = inscricoes.find((i) => i.id === idAtualizado);
          if (inscricao) inscricao.email_status = 'enviado';
        }
        renderTabela();
      } catch (e) {
        alert(e.message || 'Não foi possível reenviar o e-mail. Tente novamente.');
        botaoReenviarEmail.disabled = false;
        botaoReenviarEmail.textContent = 'O e-mail de confirmação não foi entregue — reenviar';
      }
      return;
    }

    const botaoMenuAcoesClicado = evento.target.closest('[data-menu-acoes]');
    if (botaoMenuAcoesClicado) {
      const id = Number(botaoMenuAcoesClicado.dataset.menuAcoes);
      if (menusAcoesAbertos.has(id)) {
        menusAcoesAbertos.delete(id);
      } else {
        menusAcoesAbertos.add(id);
      }
      renderTabela();
      return;
    }

    const botaoDetalheClicado = evento.target.closest('[data-toggle-detalhe]');
    if (botaoDetalheClicado) {
      const chave = botaoDetalheClicado.dataset.toggleDetalhe;
      if (detalhesExpandidos.has(chave)) {
        detalhesExpandidos.delete(chave);
      } else {
        detalhesExpandidos.add(chave);
      }
      renderTabela();
      return;
    }

    const linha = evento.target.closest('[data-toggle-grupo]');
    if (!linha) return;
    const id = Number(linha.dataset.toggleGrupo);
    if (gruposExpandidos.has(id)) {
      gruposExpandidos.delete(id);
    } else {
      gruposExpandidos.add(id);
    }
    renderTabela();
  });

  function abrirModalExclusao(id, descricao) {
    idParaExcluir = id;
    descricaoExclusao.textContent = `Tem certeza que deseja excluir "${descricao}"?`;
    senhaExclusao.value = '';
    erroExclusao.style.display = 'none';
    modalExcluir.hidden = false;
    senhaExclusao.focus();
  }

  function fecharModalExclusao() {
    idParaExcluir = null;
    modalExcluir.hidden = true;
  }

  btnCancelarExclusao.addEventListener('click', fecharModalExclusao);
  modalExcluir.addEventListener('click', (evento) => {
    if (evento.target === modalExcluir) fecharModalExclusao();
  });

  btnConfirmarExclusao.addEventListener('click', async () => {
    if (!idParaExcluir) return;
    const senha = senhaExclusao.value;
    if (!senha) {
      erroExclusao.textContent = 'Digite sua senha.';
      erroExclusao.style.display = 'block';
      return;
    }

    btnConfirmarExclusao.disabled = true;
    btnConfirmarExclusao.textContent = 'Excluindo…';

    try {
      const resp = await fetch(`/api/admin/inscricoes/${idParaExcluir}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      });
      const dados = await resp.json();

      if (!resp.ok) {
        erroExclusao.textContent = dados.erro || 'Não foi possível excluir.';
        erroExclusao.style.display = 'block';
        return;
      }

      inscricoes = inscricoes.filter((i) => i.id !== idParaExcluir);
      gruposExpandidos.delete(idParaExcluir);
      menusAcoesAbertos.delete(idParaExcluir);
      fecharModalExclusao();
      renderResumo();
      renderTabela();
    } catch (e) {
      erroExclusao.textContent = 'Falha de conexão. Tente novamente.';
      erroExclusao.style.display = 'block';
    } finally {
      btnConfirmarExclusao.disabled = false;
      btnConfirmarExclusao.textContent = 'Excluir';
    }
  });

  filtroModalidade.addEventListener('change', renderTabela);
  filtroNivel.addEventListener('change', renderTabela);
  filtroBusca.addEventListener('input', renderTabela);

  btnImprimir.addEventListener('click', () => {
    // Expande todas as equipes antes de imprimir, para o elenco completo sair no papel.
    inscricoes.forEach((i) => gruposExpandidos.add(i.id));
    renderTabela();
    window.print();
  });

  btnSair.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
})();
