// Editais da Proaes, da Prograd e da Proex. Abre com o que já foi lido e só pede à Ufac quando o cache
// venceu (algumas horas) ou ao puxar para atualizar. Cada edital abre no Safari, na página oficial com os PDFs.
import { editaisGuardados, ehEditalMonitoria, enderecoPasta, FONTES, infoHorasComplementares, lerEditaisDe, rotuloDatas } from '../lib/editais.js';
import { rotuloAtualizado } from '../lib/dominio/formatos.js';
import { gravar } from '../lib/armazenamento.js';
import { ativarPush, instalado, lerPrefs, sincronizarAgenda, suportaPush } from '../lib/push.js';
import { avisar, botaoRedondo, cabecalho, esqueleto, faixa, html, ic, item, marcarSegmento, montar, notaRodape, puxarParaAtualizar, remontar, segmentos, vazio } from '../ui/componentes.js';
import { faixaFalha, fraseDeFalha } from './comum.js';

const contagem = (n, ano) => `${n === 1 ? '1 edital' : `${n} editais`} de ${ano}`;
const NOTA_HORAS = 'Estimativa pela categoria do edital. Confira a carga no PDF e quanto o seu curso aproveita, no PPC.';

const chip = (id, nome, ativo) =>
  html`<button class="chip-filtro tocavel" data-acao="filtro" data-valor="${id}" aria-pressed="${String(ativo)}">${nome}</button>`;

/** Cartão de edital: título, datas e, quando rende horas complementares, o selo com a faixa. */
const cartaoEdital = (e) => item({ icone: 'megafone', titulo: e.titulo, sub: rotuloDatas(e), href: e.url, extra: infoHorasComplementares(e) });

export default async function editais(tela, { voltar, parametro, acoes }) {
  let fonte = FONTES[parametro] ? parametro : 'proaes';
  let filtroHoras = false;
  let filtroMonitoria = false;
  let avisoMonitoria = false;
  let falha = '';
  let lendo = false;
  let geracao = 0;

  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Editais', sub: 'Proaes, Prograd e Proex · site da Ufac', acoes: botaoRedondo('voltar', 'Voltar', 'voltar') })}
    ${segmentos(Object.entries(FONTES).map(([id, f]) => ({ id, nome: f.nome })), fonte, 'fonte', 'Pró-reitoria')}
    <div class="filtros-editais" role="group" aria-label="Filtros"></div>
    <div class="lista-editais pilha"></div>
    ${notaRodape('Lista pública do site da Ufac: não usa seu login. Os editais e resultados abrem no Safari.')}
  </div>`);
  const area = tela.querySelector('.lista-editais');
  const filtros = tela.querySelector('.filtros-editais');

  function desenharFiltros() {
    remontar(filtros, html`
      ${chip('horas', 'Horas complementares', filtroHoras)}
      ${fonte === 'prograd' ? chip('monitoria', 'Monitoria', filtroMonitoria) : ''}`);
  }

  /** Aviso de bolsa de monitoria (só na Prograd): interruptor, ou o convite para instalar o app. */
  function cartaoAvisoMonitoria() {
    if (fonte !== 'prograd') return '';
    const pushOk = suportaPush() && instalado();
    if (!pushOk) {
      return html`<section class="cartao">${faixa({ icone: 'sino', titulo: 'Avise-me quando abrir bolsa de monitoria', texto: 'O iPhone só manda notificações para apps instalados na Tela de Início (iOS 16.4 ou mais novo).' })}
        ${!instalado() ? html`<a class="botao claro largo tocavel" style="margin-top:10px" href="/instalar/">Como instalar</a>` : ''}</section>`;
    }
    return html`<section class="cartao lista"><label class="item" style="cursor:pointer">
      <span class="cresce"><span class="titulo">Avisar quando abrir bolsa de monitoria</span><span class="apoio sub">Uma notificação neste iPhone quando sair edital novo de monitoria na Prograd.</span></span>
      <input type="checkbox" class="interruptor" role="switch" aria-label="Avisar quando abrir bolsa de monitoria" data-chave="monitoria" ${avisoMonitoria ? html`checked` : ''}>
    </label></section>`;
  }

  async function desenhar() {
    const g = await editaisGuardados(fonte);
    avisoMonitoria = (await lerPrefs()).avisos.monitoria === true;
    const { nome, sobre } = FONTES[fonte];
    desenharFiltros();
    let corpo;
    if (!g) {
      corpo = lendo ? html`<section class="cartao">${esqueleto(5)}</section>` : '';
    } else if (!g.lista.length) {
      corpo = html`<section class="cartao">${vazio('megafone', 'Nenhum edital publicado ainda', `A ${nome} ainda não publicou editais em ${g.ano}.`)}</section>`;
    } else {
      let lista = g.lista;
      if (filtroHoras) lista = lista.filter((e) => infoHorasComplementares(e));
      if (filtroMonitoria && fonte === 'prograd') lista = lista.filter(ehEditalMonitoria);
      const filtrando = filtroHoras || (filtroMonitoria && fonte === 'prograd');
      if (!lista.length) {
        const outras = Object.entries(FONTES).filter(([id]) => id !== fonte);
        corpo = html`<section class="cartao">
          ${vazio('megafone', filtroMonitoria && !filtroHoras ? 'Nenhum edital de monitoria agora' : 'Nenhum edital com horas complementares agora', `A ${nome} não tem edital assim em ${g.ano}.${filtroHoras ? ' Veja a ' + outras.map(([, f]) => f.nome).join(' e a ') + '.' : ''}`)}
          ${filtroHoras ? html`<div class="par-botoes">${outras.map(([id, f]) => html`<button class="botao claro tocavel" data-acao="trocar-fonte" data-valor="${id}">Ver ${f.nome}</button>`)}</div>` : ''}
        </section>`;
      } else {
        corpo = html`
          <div class="apoio">${filtrando ? `${lista.length === 1 ? '1 edital' : `${lista.length} editais`} de ${g.lista.length}` : contagem(g.lista.length, g.ano)} · ${rotuloAtualizado(g.lidoEm)}</div>
          ${filtroHoras ? html`<div class="apoio">${NOTA_HORAS}</div>` : ''}
          <section class="cartao lista">${lista.map(cartaoEdital)}</section>`;
      }
    }
    remontar(area, html`
      <div class="apoio">${sobre}</div>
      ${cartaoAvisoMonitoria()}
      ${falha ? faixaFalha(falha) : ''}
      ${corpo}
      ${g ? html`<section class="cartao lista">${item({ icone: 'globo', titulo: `Todos os editais da ${nome} de ${g.ano}`, sub: 'Página oficial, com os anexos e resultados', href: enderecoPasta(fonte, g.ano) })}</section>` : ''}`);
    // O "checked" é uma propriedade: depois de remontar, confere com o que está salvo.
    const chave = area.querySelector('[data-chave="monitoria"]');
    if (chave) chave.checked = avisoMonitoria;
  }

  async function carregar(forcar = false) {
    const minha = ++geracao;
    const qual = fonte;
    falha = '';
    lendo = true;
    await desenhar();
    try {
      await lerEditaisDe(qual, { forcar });
    } catch (e) {
      if (minha === geracao) falha = fraseDeFalha(e, `o site da ${FONTES[qual].nome}`, (await editaisGuardados(qual))?.lidoEm);
    }
    if (minha !== geracao) return; // trocou de aba enquanto lia: a outra leitura desenha
    lendo = false;
    await desenhar();
  }

  function trocarFonte(nova) {
    if (nova === fonte) return;
    fonte = nova;
    if (fonte !== 'prograd') filtroMonitoria = false;
    history.replaceState(null, '', `#/editais/${fonte}`); // voltar a esta tela abre na mesma aba
    carregar();
  }

  acoes.voltar = voltar;
  acoes.fonte = (el) => {
    if (el.dataset.valor === fonte) return;
    marcarSegmento(el);
    trocarFonte(el.dataset.valor);
  };
  acoes['trocar-fonte'] = (el) => {
    const alvo = el.dataset.valor;
    tela.querySelector(`.segmentos [data-valor="${alvo}"]`) && marcarSegmento(tela.querySelector(`.segmentos [data-valor="${alvo}"]`));
    trocarFonte(alvo);
  };
  acoes.filtro = (el) => {
    if (el.dataset.valor === 'horas') filtroHoras = !filtroHoras;
    else filtroMonitoria = !filtroMonitoria;
    desenhar();
  };

  tela.addEventListener('change', async (e) => {
    if (e.target.dataset?.chave !== 'monitoria') return;
    const ligado = e.target.checked;
    const p = await lerPrefs();
    p.avisos.monitoria = ligado;
    await gravar('prefs', p);
    try {
      if (ligado && Notification.permission !== 'granted') await ativarPush();
      else await sincronizarAgenda();
      if (ligado) avisar('Aviso ligado. Você será avisado quando sair edital de monitoria.', { ok: true });
    } catch (falhaPush) {
      avisar(falhaPush.message);
      e.target.checked = false;
      p.avisos.monitoria = false;
      await gravar('prefs', p);
    }
  });

  tela.addEventListener('atualizar', (e) => carregar(e.detail?.forcar !== false));
  puxarParaAtualizar(tela, () => carregar(true));
  await carregar();
}
