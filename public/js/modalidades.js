// Fonte única: busca a configuração de modalidades direto da API,
// que por sua vez lê data/modalidades.json no servidor.
window.Modalidades = (function () {
  let cache = null;

  async function carregar() {
    if (cache) return cache;
    const resp = await fetch('/api/modalidades');
    if (!resp.ok) throw new Error('Não foi possível carregar as modalidades.');
    cache = await resp.json();
    return cache;
  }

  function porId(lista, id) {
    return lista.find((m) => m.id === id);
  }

  return { carregar, porId };
})();
