// Editais da Proaes (bolsas e auxílios) e da Prograd. Abre com o que já foi lido e só pede à Ufac quando o cache
// venceu (algumas horas) ou ao puxar para atualizar. Cada edital abre no Safari, na página oficial com os PDFs.
import { editaisGuardados, enderecoPasta, FONTES, lerEditaisDe, rotuloDatas } from '../lib/editais.js';
import { rotuloAtualizado } from '../lib/dominio/formatos.js';
import { botaoRedondo, cabecalho, esqueleto, html, item, marcarSegmento, montar, notaRodape, puxarParaAtualizar, remontar, segmentos, vazio } from '../ui/componentes.js';
import { faixaFalha, fraseDeFalha } from './comum.js';

const contagem = (n, ano) => `${n === 1 ? '1 edital' : `${n} editais`} de ${ano}`;

export default async function editais(tela, { voltar, parametro, acoes }) {
  let fonte = FONTES[parametro] ? parametro : 'proaes';
  let falha = '';
  let lendo = false;
  let geracao = 0;

  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Editais', sub: 'Proaes e Prograd · site da Ufac', acoes: botaoRedondo('voltar', 'Voltar', 'voltar') })}
    ${segmentos(Object.entries(FONTES).map(([id, f]) => ({ id, nome: f.nome })), fonte, 'fonte', 'Pró-reitoria')}
    <div class="lista-editais pilha"></div>
    ${notaRodape('Lista pública do site da Ufac: não usa seu login. Os editais e resultados abrem no Safari.')}
  </div>`);
  const area = tela.querySelector('.lista-editais');

  async function desenhar() {
    const g = await editaisGuardados(fonte);
    const { nome, sobre } = FONTES[fonte];
    let corpo;
    if (!g) {
      corpo = lendo ? html`<section class="cartao">${esqueleto(5)}</section>` : '';
    } else if (!g.lista.length) {
      corpo = html`<section class="cartao">${vazio('megafone', 'Nenhum edital publicado ainda', `A ${nome} ainda não publicou editais em ${g.ano}.`)}</section>`;
    } else {
      corpo = html`
        <div class="apoio">${contagem(g.lista.length, g.ano)} · ${rotuloAtualizado(g.lidoEm)}</div>
        <section class="cartao lista">${g.lista.map((e) => item({ icone: 'megafone', titulo: e.titulo, sub: rotuloDatas(e), href: e.url }))}</section>`;
    }
    remontar(area, html`
      <div class="apoio">${sobre}</div>
      ${falha ? faixaFalha(falha) : ''}
      ${corpo}
      ${g ? html`<section class="cartao lista">${item({ icone: 'globo', titulo: `Todos os editais da ${nome} de ${g.ano}`, sub: 'Página oficial, com os anexos e resultados', href: enderecoPasta(fonte, g.ano) })}</section>` : ''}`);
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

  acoes.voltar = voltar;
  acoes.fonte = (el) => {
    if (el.dataset.valor === fonte) return;
    fonte = el.dataset.valor;
    marcarSegmento(el);
    history.replaceState(null, '', `#/editais/${fonte}`); // voltar a esta tela abre na mesma aba
    carregar();
  };
  tela.addEventListener('atualizar', (e) => carregar(e.detail?.forcar !== false));
  puxarParaAtualizar(tela, () => carregar(true));
  await carregar();
}
