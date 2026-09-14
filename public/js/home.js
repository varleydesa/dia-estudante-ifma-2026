(async function () {
  const carregando = document.getElementById('modalidades-carregando');
  const gradeIndividuais = document.getElementById('grade-individuais');
  const gradeEquipes = document.getElementById('grade-equipes');
  const gradeOficinas = document.getElementById('grade-oficinas');

  try {
    const modalidades = await window.Modalidades.carregar();
    gradeIndividuais.innerHTML = modalidades
      .filter((m) => m.tipo === 'individual' && m.secao !== 'oficinas')
      .map(renderCard)
      .join('');
    gradeEquipes.innerHTML = modalidades.filter((m) => m.tipo === 'equipe').map(renderCard).join('');
    gradeOficinas.innerHTML = modalidades.filter((m) => m.secao === 'oficinas').map(renderCard).join('');
    carregando.hidden = true;
  } catch (e) {
    carregando.innerHTML = '<p>Não foi possível carregar as modalidades agora. Recarregue a página.</p>';
  }

  function renderCard(m) {
    const detalhes = [];
    detalhes.push(`Categoria: ${m.categorias.join(' ou ')}`);
    if (m.temNivel) detalhes.push('Ensino Médio e Superior disputam separadamente');
    if (m.tipo === 'equipe') {
      if (m.titulares) {
        detalhes.push(`${m.titulares} titulares obrigatórios + até ${m.reservas} reservas (opcionais)`);
      } else if (m.minAtletas && m.minAtletas === m.maxAtletas) {
        detalhes.push(`Exatamente ${m.minAtletas} integrantes obrigatórios`);
      } else {
        if (m.minAtletas) detalhes.push(`Mínimo de ${m.minAtletas} integrantes`);
        if (m.maxAtletas) detalhes.push(`Máximo de ${m.maxAtletas} integrantes`);
      }
    }
    if (m.multiProva) detalhes.push('Pode escolher mais de uma prova');

    const tipoClasse = m.secao === 'oficinas' ? 'oficina' : m.tipo;
    const tipoTexto = m.secao === 'oficinas' ? 'Oficina/Exposição' : m.tipo === 'equipe' ? 'Modalidade coletiva' : 'Modalidade individual';

    return `
      <article class="cartao-modalidade">
        <span class="etiqueta-tipo ${tipoClasse}">${tipoTexto}</span>
        <h3>${m.nome}</h3>
        <ul>${detalhes.map((d) => `<li>${d}</li>`).join('')}</ul>
        <span class="previsao">Previsão: ${m.previsao}</span>
      </article>
    `;
  }
})();
