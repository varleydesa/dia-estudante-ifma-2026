(function () {
  const form = document.getElementById('form-login');
  const mensagemErro = document.getElementById('mensagem-erro');
  const btnEntrar = document.getElementById('btn-entrar');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensagemErro.style.display = 'none';

    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value;

    btnEntrar.disabled = true;
    btnEntrar.textContent = 'Entrando…';

    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      const dados = await resp.json();

      if (!resp.ok) {
        mensagemErro.textContent = dados.erro || 'Não foi possível entrar.';
        mensagemErro.style.display = 'block';
        return;
      }

      if (dados.precisaTrocarSenha) {
        window.location.href = 'trocar-senha.html?obrigatorio=1';
      } else {
        window.location.href = 'painel.html';
      }
    } catch (e) {
      mensagemErro.textContent = 'Falha de conexão. Tente novamente.';
      mensagemErro.style.display = 'block';
    } finally {
      btnEntrar.disabled = false;
      btnEntrar.textContent = 'Entrar';
    }
  });
})();
