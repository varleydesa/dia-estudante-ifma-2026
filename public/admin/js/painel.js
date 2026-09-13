(function () {
  const carregando = document.getElementById('carregando');
  const conteudo = document.getElementById('conteudo');
  const usuarioLogado = document.getElementById('usuario-logado');
  const resumoModalidades = document.getElementById('resumo-modalidades');
  const filtroModalidade = document.getElementById('filtro-modalidade');
  const filtroNivel = document.getElementById('filtro-nivel');
  const filtroBusca = document.getElementById('filtro-busca');
  const corpoTabela = document.getElementById('corpo-tabela');
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
    const contagemPorModalidade = new Map();
    for (const i of inscricoes) {
      contagemPorModalidade.set(i.modalidade_nome, (contagemPorModalidade.get(i.modalidade_nome) || 0) + 1);
    }

    const totalParticipantes = inscricoes.reduce((soma, i) => soma + i.participantes.length, 0);

    const cartoes = [
      `<div class="cartao-resumo"><span class="numero">${inscricoes.length}</span><span class="rotulo-resumo">Inscrições registradas</span></div>`,
      `<div class="cartao-resumo"><span class="numero">${totalParticipantes}</span><span class="rotulo-resumo">Participantes no total</span></div>`,
    ];

    for (const [nome, qtd] of contagemPorModalidade) {
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
        participantesCorrespondentes = inscricao.participantes.filter((p) =>
          p.nome_completo.toLowerCase().includes(busca)
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

  function botaoExcluir(inscricao, descricao) {
    return `<button type="button" class="btn btn-remover btn-pequeno" data-excluir="${inscricao.id}" data-descricao="${descricao.replace(/"/g, '&quot;')}">Excluir</button>`;
  }

  function linhaParticipante(inscricao, p, { indentada } = {}) {
    return `
      <tr class="${indentada ? 'linha-detalhe' : ''}">
        <td></td>
        <td>${inscricao.modalidade_nome}</td>
        <td>${inscricao.nivel || '—'}</td>
        <td>${inscricao.categoria || '—'}</td>
        <td>${inscricao.nome_equipe || '—'}</td>
        <td>${papelDe(p)}</td>
        <td>${p.nome_completo}</td>
        <td>${p.matricula || '—'}</td>
        <td>${p.curso || '—'}</td>
        <td>${p.telefone || '—'}</td>
        <td>${p.email || '—'}</td>
        <td>${inscricao.provas ? inscricao.provas.join(', ') : '—'}</td>
        <td>${inscricao.criado_em}</td>
        <td>${indentada ? '' : botaoExcluir(inscricao, `${inscricao.modalidade_nome} — ${p.nome_completo}`)}</td>
      </tr>
    `;
  }

  function renderTabela() {
    const grupos = gruposFiltrados();

    const totalParticipantesExibidos = grupos.reduce(
      (soma, g) => soma + (g.buscaAtiva ? g.participantesCorrespondentes.length : g.inscricao.participantes.length),
      0
    );
    contagemResultados.textContent = `${grupos.length} inscrição(ões) · ${totalParticipantesExibidos} participante(s) encontrado(s).`;

    const linhas = [];

    for (const { inscricao, buscaAtiva } of grupos) {
      const ehEquipe = inscricao.tipo === 'equipe' && inscricao.participantes.length > 1;

      if (!ehEquipe) {
        linhas.push(linhaParticipante(inscricao, inscricao.participantes[0]));
        continue;
      }

      const expandido = buscaAtiva || gruposExpandidos.has(inscricao.id);
      const capitao = inscricao.participantes.find((p) => p.capitao) || inscricao.participantes[0];

      linhas.push(`
        <tr class="linha-grupo" data-toggle-grupo="${inscricao.id}">
          <td><button type="button" class="botao-expandir" aria-expanded="${expandido}">${expandido ? '▾' : '▸'}</button></td>
          <td>${inscricao.modalidade_nome}</td>
          <td>${inscricao.nivel || '—'}</td>
          <td>${inscricao.categoria || '—'}</td>
          <td>${inscricao.nome_equipe || '—'}</td>
          <td>${inscricao.participantes.length} integrante(s)</td>
          <td>${capitao.nome_completo} <span class="emblema capitao">Capitão(ã)</span></td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>${inscricao.provas ? inscricao.provas.join(', ') : '—'}</td>
          <td>${inscricao.criado_em}</td>
          <td>${botaoExcluir(inscricao, `${inscricao.modalidade_nome} — ${inscricao.nome_equipe}`)}</td>
        </tr>
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

  corpoTabela.addEventListener('click', (evento) => {
    const botaoExcluirClicado = evento.target.closest('[data-excluir]');
    if (botaoExcluirClicado) {
      abrirModalExclusao(Number(botaoExcluirClicado.dataset.excluir), botaoExcluirClicado.dataset.descricao);
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
