(function () {
  const listaIndividuais = document.getElementById('lista-individuais');
  const listaEquipes = document.getElementById('lista-equipes');
  const paineis = document.getElementById('paineis-modalidades');
  const mensagem = document.getElementById('mensagem-envio');
  const form = document.getElementById('form-inscricao');
  const btnEnviar = document.getElementById('btn-enviar');
  const barraResumo = document.getElementById('barra-resumo');
  const barraResumoItens = document.getElementById('barra-resumo-itens');

  let modalidades = [];
  const contadorAtletaPorModalidade = {};

  init();

  async function init() {
    try {
      modalidades = await window.Modalidades.carregar();
    } catch (e) {
      mostrarMensagem('erro', 'Não foi possível carregar as modalidades. Recarregue a página.');
      return;
    }

    listaIndividuais.innerHTML = modalidades.filter((m) => m.tipo === 'individual').map(renderOpcao).join('');
    listaEquipes.innerHTML = modalidades.filter((m) => m.tipo === 'equipe').map(renderOpcao).join('');

    document.querySelectorAll('[data-toggle-modalidade]').forEach((chk) => {
      chk.addEventListener('change', () => {
        alternarPainel(chk.dataset.toggleModalidade, chk.checked);
        atualizarResumo();
      });
    });

    barraResumoItens.addEventListener('click', (evento) => {
      const botaoRemover = evento.target.closest('[data-remover-chip]');
      if (botaoRemover) {
        evento.preventDefault();
        const id = botaoRemover.dataset.removerChip;
        const chk = document.querySelector(`[data-toggle-modalidade="${id}"]`);
        chk.checked = false;
        alternarPainel(id, false);
        atualizarResumo();
        return;
      }

      const link = evento.target.closest('[data-ir-para]');
      if (link) {
        evento.preventDefault();
        document.getElementById(`painel-${link.dataset.irPara}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    ajustarPosicaoBarraResumo();
    window.addEventListener('resize', ajustarPosicaoBarraResumo);

    form.addEventListener('submit', aoEnviar);
  }

  function ajustarPosicaoBarraResumo() {
    const header = document.querySelector('header.principal');
    if (header) barraResumo.style.top = `${header.getBoundingClientRect().height}px`;
  }

  function atualizarResumo() {
    const marcadas = modalidades.filter((m) => document.querySelector(`[data-toggle-modalidade="${m.id}"]`)?.checked);

    if (marcadas.length === 0) {
      barraResumo.hidden = true;
      barraResumoItens.innerHTML = '';
      return;
    }

    barraResumo.hidden = false;
    barraResumoItens.innerHTML = marcadas
      .map(
        (m) => `
          <span class="chip-modalidade">
            <a href="#painel-${m.id}" data-ir-para="${m.id}">${m.nome}</a>
            <button type="button" data-remover-chip="${m.id}" aria-label="Remover ${m.nome}">×</button>
          </span>
        `
      )
      .join('');
  }

  function renderOpcao(m) {
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

  function alternarPainel(id, ligado) {
    const existente = document.getElementById(`painel-${id}`);
    if (ligado && !existente) {
      const modalidade = window.Modalidades.porId(modalidades, id);
      paineis.insertAdjacentHTML('beforeend', renderPainel(modalidade));
      ligarEventosPainel(modalidade);
    } else if (!ligado && existente) {
      existente.remove();
    }
  }

  function renderPainel(m) {
    const partes = [`<div class="painel-modalidade" id="painel-${m.id}"><h4>${m.nome}</h4>`];

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
          Você (responsável pelos dados acima) será incluído automaticamente como capitão(ã) da equipe.
          Adicione abaixo os demais integrantes.
        </p>
        <div id="atletas-${m.id}"></div>
        <button type="button" class="btn btn-fantasma btn-pequeno" data-add-atleta="${m.id}">+ Adicionar integrante</button>
        <div class="contador-equipe" id="contador-${m.id}"></div>
      `);
    }

    partes.push('</div>');
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

  function mostrarMensagem(tipo, texto) {
    mensagem.textContent = texto;
    mensagem.className = `mensagem-envio ${tipo}`;
    mensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function valorRadio(nome) {
    const el = document.querySelector(`input[name="${nome}"]:checked`);
    return el ? el.value : null;
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    mensagem.className = 'mensagem-envio';

    const responsavel = {
      nome_completo: document.getElementById('resp-nome').value.trim(),
      matricula: document.getElementById('resp-matricula').value.trim(),
      curso: document.getElementById('resp-curso').value.trim(),
      telefone: document.getElementById('resp-telefone').value.trim(),
      email: document.getElementById('resp-email').value.trim(),
      nivel: valorRadio('resp-nivel'),
    };

    if (!responsavel.nome_completo || !responsavel.matricula || !responsavel.curso || !responsavel.telefone || !responsavel.email) {
      mostrarMensagem('erro', 'Preencha todos os campos obrigatórios em "Seus dados".');
      return;
    }
    if (!responsavel.nivel) {
      mostrarMensagem('erro', 'Selecione seu nível de ensino.');
      return;
    }

    const marcadas = Array.from(document.querySelectorAll('[data-toggle-modalidade]:checked')).map(
      (chk) => chk.dataset.toggleModalidade
    );

    if (marcadas.length === 0) {
      mostrarMensagem('erro', 'Marque ao menos uma modalidade para se inscrever.');
      return;
    }

    const inscricoes = [];
    for (const id of marcadas) {
      const m = window.Modalidades.porId(modalidades, id);
      const item = { modalidade_id: id };

      if (m.categorias.length > 1) {
        const categoria = valorRadio(`categoria-${id}`);
        if (!categoria) {
          mostrarMensagem('erro', `Selecione a categoria em "${m.nome}".`);
          return;
        }
        item.categoria = categoria;
      }

      if (m.multiProva) {
        const provas = Array.from(document.querySelectorAll(`input[name="prova-${id}"]:checked`)).map((c) => c.value);
        if (provas.length === 0) {
          mostrarMensagem('erro', `Selecione ao menos uma prova em "${m.nome}".`);
          return;
        }
        item.provas = provas;
      }

      if (m.tipo === 'equipe') {
        const nomeEquipe = document.getElementById(`equipe-nome-${id}`).value.trim();
        if (!nomeEquipe) {
          mostrarMensagem('erro', `Informe o nome da equipe em "${m.nome}".`);
          return;
        }
        item.nome_equipe = nomeEquipe;

        const linhas = document.querySelectorAll(`#atletas-${id} .linha-atleta`);
        const atletas = [];
        for (const linha of linhas) {
          const nome = linha.querySelector('[data-atleta-nome]').value.trim();
          const matricula = linha.querySelector('[data-atleta-matricula]').value.trim();
          const curso = linha.querySelector('[data-atleta-curso]').value.trim();
          if (!nome || !matricula) {
            mostrarMensagem('erro', `Preencha nome e matrícula de todos os integrantes em "${m.nome}".`);
            return;
          }
          const atleta = { nome_completo: nome, matricula, curso: curso || undefined };
          const selTitular = linha.querySelector('[data-atleta-titular]');
          if (selTitular) atleta.titular = selTitular.value === 'titular';
          atletas.push(atleta);
        }

        const total = atletas.length + 1;
        if (m.minAtletas && total < m.minAtletas) {
          mostrarMensagem('erro', `"${m.nome}" exige no mínimo ${m.minAtletas} integrantes (você tem ${total}).`);
          return;
        }
        if (m.maxAtletas && total > m.maxAtletas) {
          mostrarMensagem('erro', `"${m.nome}" permite no máximo ${m.maxAtletas} integrantes (você tem ${total}).`);
          return;
        }
        if (m.titulares) {
          const titulares = 1 + atletas.filter((a) => a.titular).length;
          const reservas = atletas.filter((a) => !a.titular).length;
          if (titulares !== m.titulares) {
            mostrarMensagem('erro', `"${m.nome}" exige exatamente ${m.titulares} titulares (você tem ${titulares}).`);
            return;
          }
          if (reservas > m.reservas) {
            mostrarMensagem('erro', `"${m.nome}" permite no máximo ${m.reservas} reservas (você tem ${reservas}), que são opcionais.`);
            return;
          }
        }

        item.atletas = atletas;
      }

      inscricoes.push(item);
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

      mostrarMensagem('sucesso', 'Inscrição enviada com sucesso! Fique atento ao congresso técnico da sua modalidade.');
      form.reset();
      paineis.innerHTML = '';
      atualizarResumo();
    } catch (e) {
      mostrarMensagem('erro', 'Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar inscrição';
    }
  }
})();
