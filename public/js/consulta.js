(async function () {
  const subtitulo = document.getElementById('subtitulo');
  const mensagem = document.getElementById('mensagem-envio');
  const lista = document.getElementById('lista-inscricoes');

  function mostrarErro(texto) {
    mensagem.textContent = texto;
    mensagem.className = 'mensagem-envio erro';
  }

  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    subtitulo.textContent = '';
    mostrarErro('Link inválido. Use o link enviado no e-mail de confirmação da sua inscrição.');
    return;
  }

  try {
    const resp = await fetch(`/api/consulta/${encodeURIComponent(token)}`);
    if (!resp.ok) {
      const dados = await resp.json().catch(() => ({}));
      subtitulo.textContent = '';
      mostrarErro(dados.erro || 'Não foi possível carregar suas inscrições.');
      return;
    }

    const dados = await resp.json();
    subtitulo.textContent = `Olá, ${dados.nome}! Aqui está o resumo das suas inscrições no Dia do Estudante 2026.`;
    lista.innerHTML = dados.inscricoes.map(renderCartao).join('');
  } catch (e) {
    subtitulo.textContent = '';
    mostrarErro('Falha de conexão. Verifique sua internet e tente novamente.');
  }

  function renderCartao(i) {
    const cancelada = i.status === 'cancelada';
    const detalhes = [`Categoria: ${i.categoria || '—'}`];
    if (i.nivel) detalhes.push(`Nível: ${i.nivel}`);
    if (i.nome_equipe) detalhes.push(`Time: ${i.nome_equipe}`);
    if (i.provas && i.provas.length) detalhes.push(`Provas: ${i.provas.join(', ')}`);
    detalhes.push(`Inscrito em: ${i.criado_em}`);

    const integrantes =
      i.integrantes && i.integrantes.length
        ? `
          <div class="subgrupo-titulo">Integrantes</div>
          <ul>${i.integrantes.map((p) => `<li>${p.nome_completo}${p.papel ? ` — ${p.papel}` : ''}</li>`).join('')}</ul>
        `
        : '';

    return `
      <article class="cartao-modalidade" style="${cancelada ? 'opacity:0.6' : ''}">
        <span class="etiqueta-tipo ${cancelada ? 'equipe' : 'individual'}">
          Nº ${String(i.id).padStart(3, '0')} ${cancelada ? '· Cancelada' : ''}
        </span>
        <h3>${i.modalidade_nome}</h3>
        <ul>${detalhes.map((d) => `<li>${d}</li>`).join('')}</ul>
        ${integrantes}
      </article>
    `;
  }
})();
