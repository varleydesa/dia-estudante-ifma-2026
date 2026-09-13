(function () {
  const form = document.getElementById('form-senha');
  const mensagem = document.getElementById('mensagem');
  const avisoObrigatorio = document.getElementById('aviso-obrigatorio');
  const linkVoltar = document.getElementById('link-voltar');
  const subtitulo = document.getElementById('subtitulo');
  const btnSalvar = document.getElementById('btn-salvar');

  let obrigatorio = false;

  init();

  async function init() {
    try {
      const resp = await fetch('/api/admin/me');
      if (resp.status === 401) {
        window.location.href = 'login.html';
        return;
      }
      const dados = await resp.json();
      obrigatorio = dados.precisaTrocarSenha === true;

      if (obrigatorio) {
        avisoObrigatorio.style.display = 'block';
        linkVoltar.style.display = 'none';
        subtitulo.textContent = 'Este é um passo obrigatório apenas no primeiro acesso.';
      } else {
        avisoObrigatorio.style.display = 'none';
        linkVoltar.style.display = 'block';
        subtitulo.textContent = 'Alterar a senha é opcional — faça isso quando quiser.';
      }
    } catch (e) {
      window.location.href = 'login.html';
    }
  }

  function mostrarMensagem(tipo, texto) {
    mensagem.textContent = texto;
    mensagem.className = `mensagem-envio ${tipo}`;
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensagem.className = 'mensagem-envio';

    const senhaAtual = document.getElementById('senha-atual').value;
    const novaSenha = document.getElementById('nova-senha').value;
    const confirmarSenha = document.getElementById('confirmar-senha').value;

    if (novaSenha !== confirmarSenha) {
      mostrarMensagem('erro', 'A confirmação não confere com a nova senha.');
      return;
    }

    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando…';

    try {
      const resp = await fetch('/api/admin/trocar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual, novaSenha, confirmarSenha }),
      });
      const dados = await resp.json();

      if (!resp.ok) {
        mostrarMensagem('erro', dados.erro || 'Não foi possível trocar a senha.');
        return;
      }

      if (obrigatorio) {
        window.location.href = 'painel.html';
      } else {
        mostrarMensagem('sucesso', 'Senha alterada com sucesso.');
        form.reset();
      }
    } catch (e) {
      mostrarMensagem('erro', 'Falha de conexão. Tente novamente.');
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar nova senha';
    }
  });
})();
