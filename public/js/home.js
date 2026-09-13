(async function () {
  const grade = document.getElementById('grade-modalidades');
  try {
    const modalidades = await window.Modalidades.carregar();
    grade.innerHTML = modalidades.map(renderCard).join('');
  } catch (e) {
    grade.innerHTML = '<p>Não foi possível carregar as modalidades agora. Recarregue a página.</p>';
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

    return `
      <article class="cartao-modalidade">
        <span class="etiqueta-tipo ${m.tipo}">${m.tipo === 'equipe' ? 'Modalidade coletiva' : 'Modalidade individual'}</span>
        <h3>${m.nome}</h3>
        <ul>${detalhes.map((d) => `<li>${d}</li>`).join('')}</ul>
        <span class="previsao">Previsão: ${m.previsao}</span>
      </article>
    `;
  }
})();
