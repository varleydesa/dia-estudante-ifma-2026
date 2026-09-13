(function () {
  const mensagem = document.getElementById('mensagem-envio');
  const form = document.getElementById('form-inscricao');
  const listaIndividuais = document.getElementById('lista-individuais');
  const listaEquipes = document.getElementById('lista-equipes');
  const etapasDetalheContainer = document.getElementById('etapas-detalhe');
  const resumoRevisao = document.getElementById('resumo-revisao');
  const progressoPreenchido = document.getElementById('progresso-preenchido');
  const progressoTexto = document.getElementById('progresso-texto');
  const btnCancelar = document.getElementById('btn-cancelar');
  const btnVoltar = document.getElementById('btn-voltar');
  const btnAvancar = document.getElementById('btn-avancar');
  const btnEnviar = document.getElementById('btn-enviar');

  let modalidades = [];
  const contadorAtletaPorModalidade = {};
  let sequenciaEtapas = [{ tipo: 'dados' }, { tipo: 'modalidades' }, { tipo: 'revisao' }];
  let etapaAtual = 0;

  init();

  async function init() {
    try {
      modalidades = await window.Modalidades.carregar();
    } catch (e) {
      mostrarMensagem('erro', 'Não foi possível carregar as modalidades. Recarregue a página.');
      return;
    }

    listaIndividuais.innerHTML = modalidades.filter((m) => m.tipo === 'individual').map(renderOpcaoModalidade).join('');
    listaEquipes.innerHTML = modalidades.filter((m) => m.tipo === 'equipe').map(renderOpcaoModalidade).join('');

    btnVoltar.addEventListener('click', () => irParaEtapa(etapaAtual - 1));
    btnAvancar.addEventListener('click', aoAvancar);
    btnEnviar.addEventListener('click', aoEnviar);
    form.addEventListener('submit', (evento) => evento.preventDefault());

    renderEtapaAtual();
  }

  function renderOpcaoModalidade(m) {
    return `
      <label class="opcao-modalidade">
        <div class="cabecalho-opcao">
          <input type="checkbox" data-toggle-modalidade="${m.id}" />
          ${m.nome}
        </div>
        <span class="previsao-mini">Categoria: ${m.categorias.join(' ou ')} · Previsão: ${m.previsao}</span>
      </label>
    `;
  }

  // ---------- Navegação entre etapas ----------

  function irParaEtapa(indice) {
    etapaAtual = Math.max(0, Math.min(indice, sequenciaEtapas.length - 1));
    renderEtapaAtual();
  }

  function elementoDaEtapa(etapa) {
    if (etapa.tipo === 'detalhe') return document.getElementById(`etapa-${etapa.modalidadeId}`);
    return document.querySelector(`[data-etapa-tipo="${etapa.tipo}"]`);
  }

  function nomeDaEtapa(etapa) {
    if (etapa.tipo === 'dados') return 'Seus dados';
    if (etapa.tipo === 'modalidades') return 'Escolha das modalidades';
    if (etapa.tipo === 'revisao') return 'Revisão e envio';
    const m = window.Modalidades.porId(modalidades, etapa.modalidadeId);
    return m ? m.nome : 'Detalhes';
  }

  function renderEtapaAtual() {
    mensagem.className = 'mensagem-envio';

    document.querySelectorAll('.etapa[data-etapa-tipo]').forEach((el) => {
      el.hidden = true;
    });

    const etapa = sequenciaEtapas[etapaAtual];
    const elEtapa = elementoDaEtapa(etapa);
    if (elEtapa) elEtapa.hidden = false;

    if (etapa.tipo === 'revisao') renderRevisao();

    const total = sequenciaEtapas.length;
    progressoPreenchido.style.width = `${((etapaAtual + 1) / total) * 100}%`;
    progressoTexto.textContent = `Passo ${etapaAtual + 1} de ${total} — ${nomeDaEtapa(etapa)}`;

    btnCancelar.hidden = etapaAtual !== 0;
    btnVoltar.hidden = etapaAtual === 0;
    btnAvancar.hidden = etapa.tipo === 'revisao';
    btnEnviar.hidden = etapa.tipo !== 'revisao';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function aoAvancar() {
    const etapa = sequenciaEtapas[etapaAtual];

    if (etapa.tipo === 'dados') {
      const erroMsg = validarDados();
      if (erroMsg) return mostrarMensagem('erro', erroMsg);
    } else if (etapa.tipo === 'modalidades') {
      const marcadas = modalidadesMarcadas();
      if (marcadas.length === 0) return mostrarMensagem('erro', 'Marque ao menos uma modalidade para se inscrever.');
      reconstruirEtapasDetalhe(marcadas);
    } else if (etapa.tipo === 'detalhe') {
      const m = window.Modalidades.porId(modalidades, etapa.modalidadeId);
      const resultado = validarModalidade(m);
      if (resultado.erro) return mostrarMensagem('erro', resultado.erro);
    }

    irParaEtapa(etapaAtual + 1);
  }

  function modalidadesMarcadas() {
    return Array.from(document.querySelectorAll('[data-toggle-modalidade]:checked')).map((chk) => chk.dataset.toggleModalidade);
  }

  function reconstruirEtapasDetalhe(idsMarcados) {
    document.querySelectorAll('#etapas-detalhe .etapa').forEach((el) => {
      if (!idsMarcados.includes(el.dataset.modalidadeId)) el.remove();
    });

    for (const id of idsMarcados) {
      if (!document.getElementById(`etapa-${id}`)) {
        const m = window.Modalidades.porId(modalidades, id);
        etapasDetalheContainer.insertAdjacentHTML('beforeend', renderEtapaDetalhe(m));
        ligarEventosPainel(m);
      }
    }

    sequenciaEtapas = [
      { tipo: 'dados' },
      { tipo: 'modalidades' },
      ...idsMarcados.map((id) => ({ tipo: 'detalhe', modalidadeId: id })),
      { tipo: 'revisao' },
    ];
  }

  // ---------- Renderização de cada modalidade ----------

  function renderEtapaDetalhe(m) {
    const partes = [
      `<div class="etapa" id="etapa-${m.id}" data-etapa-tipo="detalhe" data-modalidade-id="${m.id}" hidden>`,
      `<fieldset class="secao-form"><legend>${m.nome}</legend>`,
    ];

    if (m.categorias.length > 1) {
      partes.push(`
        <div class="campo">
          <label>Categoria <span class="obrigatorio">*</span></label>
          <div class="grupo-radio">
            ${m.categorias
              .map(
                (c) => `<label class="opcao-radio"><input type="radio" name="categoria-${m.id}" value="${c}" required /> ${c}</label>`
              )
              .join('')}
          </div>
        </div>
      `);
    }

    if (m.multiProva) {
      partes.push(`
        <div class="campo">
          <label>Provas (selecione uma ou mais) <span class="obrigatorio">*</span></label>
          <div class="grupo-checkbox">
            ${m.provas
              .map(
                (p) => `<label class="opcao-checkbox"><input type="checkbox" name="prova-${m.id}" value="${p}" /> ${p}</label>`
              )
              .join('')}
          </div>
        </div>
      `);
    }

    if (m.tipo === 'equipe') {
      partes.push(`
        <div class="campo">
          <label for="equipe-nome-${m.id}">Nome da equipe <span class="obrigatorio">*</span></label>
          <input type="text" id="equipe-nome-${m.id}" maxlength="100" required />
        </div>
        <p style="font-size:0.85rem;color:var(--texto-claro)">
          Você (responsável pelos dados informados na primeira etapa) será incluído automaticamente como
          capitão(ã) da equipe. Adicione abaixo os demais integrantes.
        </p>
        <div id="atletas-${m.id}"></div>
        <button type="button" class="btn btn-fantasma btn-pequeno" data-add-atleta="${m.id}">+ Adicionar integrante</button>
        <div class="contador-equipe" id="contador-${m.id}"></div>
      `);
    }

    partes.push('</fieldset></div>');
    return partes.join('');
  }

  function ligarEventosPainel(m) {
    if (m.tipo !== 'equipe') return;

    contadorAtletaPorModalidade[m.id] = 0;
    const linhas = m.minAtletas ? Math.max(m.minAtletas - 1, 1) : 2;
    for (let i = 0; i < linhas; i++) adicionarAtleta(m, { defaultTitular: true });

    document.querySelector(`[data-add-atleta="${m.id}"]`).addEventListener('click', () => adicionarAtleta(m, { defaultTitular: false }));
    atualizarContador(m);
  }

  function adicionarAtleta(m, { defaultTitular = false } = {}) {
    const idx = contadorAtletaPorModalidade[m.id]++;
    const linhaId = `atleta-${m.id}-${idx}`;
    const container = document.getElementById(`atletas-${m.id}`);

    const campoTitular =
      m.titulares
        ? `
          <div class="campo">
            <label>Condição</label>
            <select data-atleta-titular>
              <option value="reserva" ${defaultTitular ? '' : 'selected'}>Reserva</option>
              <option value="titular" ${defaultTitular ? 'selected' : ''}>Titular</option>
            </select>
          </div>
        `
        : '';

    container.insertAdjacentHTML(
      'beforeend',
      `
      <div class="linha-atleta" id="${linhaId}">
        <div class="campo">
          <label>Nome completo <span class="obrigatorio">*</span></label>
          <input type="text" data-atleta-nome maxlength="200" />
        </div>
        <div class="campo">
          <label>Matrícula <span class="obrigatorio">*</span></label>
          <input type="text" data-atleta-matricula maxlength="50" />
        </div>
        <div class="campo">
          <label>Curso</label>
          <input type="text" data-atleta-curso maxlength="150" />
        </div>
        ${campoTitular}
        <button type="button" class="btn btn-remover btn-pequeno" data-remover-atleta>Remover</button>
      </div>
    `
    );

    const linha = document.getElementById(linhaId);
    linha.querySelector('[data-remover-atleta]').addEventListener('click', () => {
      linha.remove();
      atualizarContador(m);
    });
    linha.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', () => atualizarContador(m)));
    atualizarContador(m);
  }

  function atualizarContador(m) {
    const elContador = document.getElementById(`contador-${m.id}`);
    if (!elContador) return;
    const linhas = document.querySelectorAll(`#atletas-${m.id} .linha-atleta`);
    const total = linhas.length + 1; // +1 = capitão(ã)

    let texto = `Total de integrantes (com você): ${total}`;
    let ok = true;
    if (m.minAtletas && total < m.minAtletas) {
      texto += ` — mínimo exigido: ${m.minAtletas}`;
      ok = false;
    }
    if (m.maxAtletas && total > m.maxAtletas) {
      texto += ` — máximo permitido: ${m.maxAtletas}`;
      ok = false;
    }
    if (m.titulares) {
      const titulares = 1 + contarPorTitular(linhas, 'titular');
      const reservas = contarPorTitular(linhas, 'reserva');
      texto += ` · Titulares: ${titulares}/${m.titulares} (obrigatório) · Reservas: ${reservas}/${m.reservas} (opcional)`;
      if (titulares !== m.titulares || reservas > m.reservas) ok = false;
    }

    elContador.textContent = texto;
    elContador.className = `contador-equipe ${ok ? 'ok' : 'alerta'}`;
  }

  function contarPorTitular(linhas, valor) {
    let n = 0;
    linhas.forEach((linha) => {
      const sel = linha.querySelector('[data-atleta-titular]');
      if (sel && sel.value === valor) n++;
    });
    return n;
  }

  // ---------- Validação ----------

  function mostrarMensagem(tipo, texto) {
    mensagem.textContent = texto;
    mensagem.className = `mensagem-envio ${tipo}`;
    mensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function valorRadio(nome) {
    const el = document.querySelector(`input[name="${nome}"]:checked`);
    return el ? el.value : null;
  }

  function coletarResponsavel() {
    return {
      nome_completo: document.getElementById('resp-nome').value.trim(),
      matricula: document.getElementById('resp-matricula').value.trim(),
      curso: document.getElementById('resp-curso').value.trim(),
      telefone: document.getElementById('resp-telefone').value.trim(),
      email: document.getElementById('resp-email').value.trim(),
      nivel: valorRadio('resp-nivel'),
    };
  }

  function validarDados() {
    const r = coletarResponsavel();
    if (!r.nome_completo || !r.matricula || !r.curso || !r.telefone || !r.email) {
      return 'Preencha todos os campos obrigatórios em "Seus dados".';
    }
    if (!r.nivel) {
      return 'Selecione seu nível de ensino.';
    }
    return null;
  }

  // Valida os campos de uma modalidade e devolve o item pronto para envio.
  function validarModalidade(m) {
    const item = { modalidade_id: m.id };

    if (m.categorias.length > 1) {
      const categoria = valorRadio(`categoria-${m.id}`);
      if (!categoria) return { erro: `Selecione a categoria em "${m.nome}".` };
      item.categoria = categoria;
    }

    if (m.multiProva) {
      const provas = Array.from(document.querySelectorAll(`input[name="prova-${m.id}"]:checked`)).map((c) => c.value);
      if (provas.length === 0) return { erro: `Selecione ao menos uma prova em "${m.nome}".` };
      item.provas = provas;
    }

    if (m.tipo === 'equipe') {
      const nomeEquipe = document.getElementById(`equipe-nome-${m.id}`).value.trim();
      if (!nomeEquipe) return { erro: `Informe o nome da equipe em "${m.nome}".` };
      item.nome_equipe = nomeEquipe;

      const linhas = document.querySelectorAll(`#atletas-${m.id} .linha-atleta`);
      const atletas = [];
      for (const linha of linhas) {
        const nome = linha.querySelector('[data-atleta-nome]').value.trim();
        const matricula = linha.querySelector('[data-atleta-matricula]').value.trim();
        const curso = linha.querySelector('[data-atleta-curso]').value.trim();
        if (!nome || !matricula) return { erro: `Preencha nome e matrícula de todos os integrantes em "${m.nome}".` };
        const atleta = { nome_completo: nome, matricula, curso: curso || undefined };
        const selTitular = linha.querySelector('[data-atleta-titular]');
        if (selTitular) atleta.titular = selTitular.value === 'titular';
        atletas.push(atleta);
      }

      const total = atletas.length + 1;
      if (m.minAtletas && total < m.minAtletas) {
        return { erro: `"${m.nome}" exige no mínimo ${m.minAtletas} integrantes (você tem ${total}).` };
      }
      if (m.maxAtletas && total > m.maxAtletas) {
        return { erro: `"${m.nome}" permite no máximo ${m.maxAtletas} integrantes (você tem ${total}).` };
      }
      if (m.titulares) {
        const titulares = 1 + atletas.filter((a) => a.titular).length;
        const reservas = atletas.filter((a) => !a.titular).length;
        if (titulares !== m.titulares) {
          return { erro: `"${m.nome}" exige exatamente ${m.titulares} titulares (você tem ${titulares}).` };
        }
        if (reservas > m.reservas) {
          return { erro: `"${m.nome}" permite no máximo ${m.reservas} reservas (você tem ${reservas}), que são opcionais.` };
        }
      }

      item.atletas = atletas;
    }

    return { item };
  }

  function idsDetalheSelecionados() {
    return sequenciaEtapas.filter((e) => e.tipo === 'detalhe').map((e) => e.modalidadeId);
  }

  // ---------- Revisão ----------

  function renderRevisao() {
    const responsavel = coletarResponsavel();
    const blocos = [
      `
        <div class="resumo-revisao-item">
          <div>
            <h4>Seus dados</h4>
            <p>${responsavel.nome_completo || '—'} · ${responsavel.matricula || '—'} · ${responsavel.curso || '—'}</p>
            <p>${responsavel.telefone || '—'} · ${responsavel.email || '—'} · ${responsavel.nivel || '—'}</p>
          </div>
          <a href="#" data-editar-etapa="0">Editar</a>
        </div>
      `,
    ];

    sequenciaEtapas.forEach((etapa, indice) => {
      if (etapa.tipo !== 'detalhe') return;
      const m = window.Modalidades.porId(modalidades, etapa.modalidadeId);
      const categoria = valorRadio(`categoria-${m.id}`) || (m.categorias.length === 1 ? m.categorias[0] : '—');
      const detalhesExtras = [];
      if (m.multiProva) {
        const provas = Array.from(document.querySelectorAll(`input[name="prova-${m.id}"]:checked`)).map((c) => c.value);
        detalhesExtras.push(`Provas: ${provas.length ? provas.join(', ') : '—'}`);
      }
      if (m.tipo === 'equipe') {
        const nomeEquipe = document.getElementById(`equipe-nome-${m.id}`)?.value.trim() || '—';
        const totalAtletas = document.querySelectorAll(`#atletas-${m.id} .linha-atleta`).length + 1;
        detalhesExtras.push(`Equipe: ${nomeEquipe} · ${totalAtletas} integrante(s)`);
      }

      blocos.push(`
        <div class="resumo-revisao-item">
          <div>
            <h4>${m.nome}</h4>
            <p>Categoria: ${categoria}</p>
            ${detalhesExtras.map((d) => `<p>${d}</p>`).join('')}
          </div>
          <a href="#" data-editar-etapa="${indice}">Editar</a>
        </div>
      `);
    });

    resumoRevisao.innerHTML = blocos.join('');
    resumoRevisao.querySelectorAll('[data-editar-etapa]').forEach((link) => {
      link.addEventListener('click', (evento) => {
        evento.preventDefault();
        irParaEtapa(Number(link.dataset.editarEtapa));
      });
    });
  }

  // ---------- Envio final ----------

  async function aoEnviar() {
    mensagem.className = 'mensagem-envio';

    const erroDados = validarDados();
    if (erroDados) {
      mostrarMensagem('erro', erroDados);
      return;
    }
    const responsavel = coletarResponsavel();

    const idsSelecionados = idsDetalheSelecionados();
    if (idsSelecionados.length === 0) {
      mostrarMensagem('erro', 'Selecione ao menos uma modalidade para se inscrever.');
      return;
    }

    const inscricoes = [];
    for (const id of idsSelecionados) {
      const m = window.Modalidades.porId(modalidades, id);
      const resultado = validarModalidade(m);
      if (resultado.erro) {
        mostrarMensagem('erro', resultado.erro);
        return;
      }
      inscricoes.push(resultado.item);
    }

    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando…';

    try {
      const resp = await fetch('/api/inscricoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsavel, inscricoes }),
      });
      const dados = await resp.json();

      if (!resp.ok) {
        mostrarMensagem('erro', dados.erro || 'Não foi possível enviar sua inscrição.');
        return;
      }

      form.reset();
      etapasDetalheContainer.innerHTML = '';
      sequenciaEtapas = [{ tipo: 'dados' }, { tipo: 'modalidades' }, { tipo: 'revisao' }];
      irParaEtapa(0);
      mostrarMensagem('sucesso', 'Inscrição enviada com sucesso! Fique atento ao congresso técnico da sua modalidade.');
    } catch (e) {
      mostrarMensagem('erro', 'Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar inscrição';
    }
  }
})();
