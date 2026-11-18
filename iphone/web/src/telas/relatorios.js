import { ler } from '../lib/armazenamento.js';
import { baixarRelatorio } from '../lib/dados.js';
import { RELATORIOS } from '../lib/config.js';
import { semestreCurto } from '../lib/dominio/academico.js';
import { abreFora, avisar, barraCompacta, botaoRedondo, cabecalho, html, ic, montar, notaRodape } from '../ui/componentes.js';
import { avisoSemEticket, fraseDeFalha } from './comum.js';

/** Visualizador em tela cheia (sobe de baixo), com o botão de compartilhar/salvar do iPhone. */
function mostrarPdf(blob, arquivo, nome) {
  const url = URL.createObjectURL(blob);
  const antes = document.activeElement;
  const tela = document.createElement('div');
  tela.className = 'qr-tela pdf-tela';
  tela.setAttribute('role', 'dialog');
  tela.setAttribute('aria-modal', 'true');
  tela.setAttribute('aria-label', nome);
  montar(tela, html`
    <div class="linha topo-pdf">
      <button class="botao-redondo vidro tocavel" data-p="fechar" aria-label="Fechar">${ic('fechar')}</button>
      <div class="cresce forte" style="text-align:center">${nome}</div>
      <button class="botao-redondo vidro tocavel" data-p="compartilhar" aria-label="Compartilhar ou salvar">${ic('compartilhar')}</button>
    </div>
    <iframe src="${url}" title="${nome}"></iframe>`);
  const fundo = [...document.body.children];
  fundo.forEach((el) => (el.inert = true));
  const fechar = () => {
    fundo.forEach((el) => (el.inert = false));
    tela.classList.add('saindo');
    setTimeout(() => {
      tela.remove();
      URL.revokeObjectURL(url);
    }, 260);
    if (antes?.isConnected) antes.focus({ preventScroll: true });
  };
  tela.addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]')?.dataset.p;
    if (p === 'fechar') fechar();
    if (p === 'compartilhar') compartilhar(blob, arquivo, nome); // toque novo: o Safari deixa compartilhar
  });
  tela.addEventListener('keydown', (e) => e.key === 'Escape' && fechar());
  document.body.append(tela);
  tela.querySelector('[data-p="fechar"]')?.focus({ preventScroll: true });
}

/** true: compartilhou (ou a pessoa fechou a folha). false: o Safari recusou (o toque "esfriou" na espera). */
async function compartilhar(blob, arquivo) {
  const file = new File([blob], arquivo, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e?.name === 'NotAllowedError') return false;
      /* AbortError: a pessoa fechou a folha */
    }
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}

export default async function relatorios(tela, { ir, acoes }) {
  const ident = await ler('identificacao');
  const mais = await ler('urlMaisRelatorios');
  const aviso = await avisoSemEticket();
  // Tocar na linha abre o PDF; o botão da direita compartilha ou salva.
  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Relatórios', sub: ident ? `${ident.curso} · ${ident.periodo}º período · ${semestreCurto(ident.semestre)}` : 'Portal do Aluno', acoes: botaoRedondo('menu', 'Menu', 'menu') })}
    ${aviso}
    <section class="cartao lista">
      ${RELATORIOS.map((r) => html`
        <div class="item">
          <button class="linha cresce tocavel" style="text-align:left;min-height:44px" data-acao="ver" data-valor="${r.acao}" aria-label="Visualizar ${r.nome}">
            <span class="icone pdf" aria-hidden="true">PDF</span>
            <span class="cresce titulo">${r.nome}</span>
          </button>
          <button class="acao-icone tocavel" data-acao="baixar" data-valor="${r.acao}" aria-label="Salvar ou compartilhar ${r.nome}">${ic('compartilhar')}</button>
        </div>`)}
    </section>
    ${mais ? html`<a class="cartao item tocavel" href="${mais}" target="_blank" rel="noopener"><span class="icone">${ic('relatorios')}</span><span class="cresce"><span class="titulo">Mais relatórios</span><span class="apoio sub">Abre no Safari; entre com o ID Ufac lá.</span></span><span class="seta">${ic('abrir')}</span>${abreFora}</a>` : ''}
    ${notaRodape('Os PDFs são gerados pelo Portal do Aluno na hora do pedido.')}
  </div>`);
  barraCompacta(tela, 'Relatórios');
  acoes.menu = () => ir('menu');

  const ocupados = new Set();
  async function pegar(el, fn) {
    const r = RELATORIOS.find((x) => x.acao === el.dataset.valor);
    if (ocupados.has(r.acao)) return;
    ocupados.add(r.acao);
    // Gerar o PDF pode levar alguns segundos (às vezes com novo login): o botão gira e, passado 1 s, um aviso explica.
    const icone = el.classList.contains('acao-icone') ? el : el.closest('.item')?.querySelector('.acao-icone');
    icone?.setAttribute('aria-busy', 'true');
    if (icone) icone.innerHTML = ic('atualizar').__cru;
    const demora = setTimeout(() => avisar('Gerando o PDF no Portal…'), 1000);
    try {
      const blob = await baixarRelatorio(r.acao);
      if (!blob) return ir('login/portal');
      await fn(blob, r);
    } catch (e) {
      avisar(fraseDeFalha(e, 'o Portal'));
    } finally {
      clearTimeout(demora);
      ocupados.delete(r.acao);
      icone?.removeAttribute('aria-busy');
      if (icone) icone.innerHTML = ic('compartilhar').__cru;
    }
  }
  acoes.ver = (el) => pegar(el, (blob, r) => mostrarPdf(blob, r.arquivo, r.nome));
  // Se a espera fez o Safari recusar a folha de compartilhar, abre o PDF: o botão de lá vem de um toque novo.
  acoes.baixar = (el) => pegar(el, async (blob, r) => (await compartilhar(blob, r.arquivo)) || mostrarPdf(blob, r.arquivo, r.nome));
}
