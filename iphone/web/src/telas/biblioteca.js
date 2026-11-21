// Biblioteca: pesquisa no acervo (pública) e exemplares de cada título. A busca só sai ao tocar em Buscar
// (ou Enter), nunca a cada letra, e as últimas buscas ficam guardadas por algumas horas.
import { ler } from '../lib/armazenamento.js';
import { buscarNoAcervo, doCache, exemplaresDoTitulo, normalizarTermo, VALIDADE_BUSCA_MS } from '../lib/biblioteca.js';
import { oficial } from '../lib/config.js';
import { rotuloAtualizado } from '../lib/dominio/formatos.js';
import { tituloCompleto } from '../lib/extratores/biblioteca.js';
import { abrirFolha, anunciar, avisar, botaoRedondo, cabecalho, esqueleto, html, ic, item, montar, notaRodape, vazio } from '../ui/componentes.js';
import { faixaFalha, fraseDeFalha } from './comum.js';

const POR_PAGINA = 30; // a Ufac devolve até 500 linhas de uma vez: mostra aos poucos

const contagem = (n) => (n === 1 ? '1 título' : `${n} títulos`);
const linhaApoio = (t) => [t.autor, t.ano].filter(Boolean).join(' · ');

const cartaoTitulo = (t, i) => html`
  <button class="item tocavel titulo-acervo" data-acao="exemplares" data-indice="${i}">
    <span class="icone">${ic('livro')}</span>
    <span class="cresce">
      <span class="titulo">${tituloCompleto(t)}</span>
      ${linhaApoio(t) ? html`<span class="apoio sub">${linhaApoio(t)}</span>` : ''}
      ${t.biblioteca ? html`<span class="selo neutro">${t.biblioteca}</span>` : ''}
    </span>
    <span class="seta">${ic('seta')}</span>
  </button>`;

function resumoExemplares(lista) {
  if (!lista.length) return '';
  const livres = lista.filter((e) => e.disponivel).length;
  const total = lista.length === 1 ? '1 no total' : `${lista.length} no total`;
  return livres
    ? html`<span class="selo verde">${livres === 1 ? '1 disponível' : `${livres} disponíveis`} · ${total}</span>`
    : html`<span class="selo">Nenhum disponível agora · ${total}</span>`;
}

const linhaExemplar = (e) => html`
  <div class="item exemplar">
    <span class="cresce">
      <span class="titulo">${e.localizacao}</span>
      <span class="apoio sub">${[e.biblioteca, e.colecao && e.colecao !== e.biblioteca ? e.colecao : null, e.regulamento].filter(Boolean).join(' · ')}</span>
    </span>
    ${e.disponivel ? html`<span class="selo verde">Disponível</span>` : html`<span class="selo">${e.situacao}</span>`}
  </div>`;

/** Folha com os exemplares do título: localização na estante e situação de cada um. */
function mostrarExemplares(titulo) {
  const { folha, fechar } = abrirFolha(html`
    <h2>${tituloCompleto(titulo)}</h2>
    ${titulo.autor ? html`<div class="texto-folha">${titulo.autor}</div>` : ''}
    <div class="exemplares-acervo" aria-live="polite"></div>
    <button class="botao largo claro tocavel" data-fechar style="margin-top:14px">Fechar</button>`);
  const area = folha.querySelector('.exemplares-acervo');
  folha.querySelector('[data-fechar]').addEventListener('click', fechar);
  async function carregar() {
    montar(area, html`<div style="padding:14px 0">${esqueleto(4)}</div>`);
    try {
      const { lista } = await exemplaresDoTitulo(titulo);
      if (!folha.isConnected) return;
      montar(area, lista.length
        ? html`<div class="resumo-exemplares">${resumoExemplares(lista)}</div>
          <div class="lista">${lista.map(linhaExemplar)}</div>
          <div class="texto-folha">Para pegar o livro, anote a localização e procure na estante, ou peça no balcão da biblioteca.</div>`
        : vazio('livro', 'Nenhum exemplar cadastrado', 'A Biblioteca não lista exemplares deste título.'));
    } catch (e) {
      if (!folha.isConnected) return;
      montar(area, html`${vazio('semConexao', 'Não consegui ver os exemplares agora', fraseDeFalha(e, 'a Biblioteca'))}
        <button class="botao largo tocavel" data-tentar>Tentar de novo</button>`);
      area.querySelector('[data-tentar]').addEventListener('click', carregar);
    }
  }
  carregar();
}

export default async function biblioteca(tela, { voltar, acoes }) {
  const id = await ler('idInterno');
  // Abre com a última busca, se ainda vale (sem pedir nada à Ufac).
  const buscas = await ler('bibliotecaBuscas');
  const ultima = buscas?.[0] ? doCache(buscas, buscas[0].chave, VALIDADE_BUSCA_MS) : null;
  let termo = ultima?.termo ?? ultima?.chave ?? '';
  let estado = ultima ? { tipo: 'lista', ...ultima } : { tipo: 'inicio' };
  let visiveis = POR_PAGINA;
  let geracao = 0;

  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Biblioteca', sub: 'Pesquisa no acervo da Ufac', acoes: botaoRedondo('voltar', 'Voltar', 'voltar') })}
    <form class="cartao busca-acervo" role="search" novalidate>
      <div class="campo">
        <label for="termo-acervo">Título, autor ou assunto</label>
        <div class="linha-busca">
          <input id="termo-acervo" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Ex.: direito civil" value="${termo}">
          <button class="botao tocavel" type="submit">Buscar</button>
        </div>
      </div>
    </form>
    <div class="resultado-acervo pilha"></div>
    ${id ? html`<section class="cartao lista">${item({ icone: 'globo', titulo: 'Meu Espaço e renovação', sub: 'Empréstimos, reservas e renovação no site oficial', href: oficial.biblioteca(id) })}</section>` : ''}
    ${notaRodape('A pesquisa no acervo é pública: não usa seu login.')}
  </div>`);

  const area = tela.querySelector('.resultado-acervo');
  const entrada = tela.querySelector('#termo-acervo');

  function desenhar() {
    if (estado.tipo === 'inicio') {
      return montar(area, html`<section class="cartao">${vazio('livro', 'Pesquise no acervo', 'Digite o título, o autor ou um assunto e toque em Buscar.')}</section>`);
    }
    if (estado.tipo === 'carregando') {
      return montar(area, html`<section class="cartao">${esqueleto(4)}</section><section class="cartao">${esqueleto(3)}</section>`);
    }
    if (estado.tipo === 'falha') return montar(area, faixaFalha(estado.texto));
    const { lista, lidoEm } = estado;
    if (!lista.length) {
      return montar(area, html`<section class="cartao">${vazio('livro', 'Nada encontrado', 'Tente outra palavra, o sobrenome do autor ou um assunto mais geral.')}</section>`);
    }
    const resto = lista.length - visiveis;
    montar(area, html`
      <div class="apoio">${contagem(lista.length)} · ${rotuloAtualizado(lidoEm)}</div>
      <section class="cartao lista">${lista.slice(0, visiveis).map((t, i) => cartaoTitulo(t, i))}</section>
      ${resto > 0 ? html`<button class="botao largo claro tocavel" data-acao="ver-mais">Ver mais (${resto > POR_PAGINA ? `mais ${POR_PAGINA} de ${resto}` : resto})</button>` : ''}`);
  }

  async function buscar() {
    const minha = ++geracao;
    visiveis = POR_PAGINA;
    estado = { tipo: 'carregando' };
    desenhar();
    try {
      const r = await buscarNoAcervo(termo);
      if (minha !== geracao) return;
      estado = { tipo: 'lista', ...r };
      anunciar(r.lista.length ? `${contagem(r.lista.length)} encontrados` : 'Nada encontrado');
    } catch (e) {
      if (minha !== geracao) return;
      estado = { tipo: 'falha', texto: fraseDeFalha(e, 'a Biblioteca') };
    }
    desenhar();
  }

  tela.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const novo = entrada.value.replace(/\s+/g, ' ').trim();
    if (normalizarTermo(novo).length < 2) {
      avisar('Digite pelo menos 2 letras para buscar.');
      return entrada.focus();
    }
    termo = novo;
    entrada.blur(); // fecha o teclado para mostrar os resultados
    buscar();
  });
  acoes.voltar = voltar;
  acoes['ver-mais'] = () => {
    visiveis += POR_PAGINA;
    desenhar();
  };
  acoes.exemplares = (el) => {
    const titulo = estado.lista?.[Number(el.dataset.indice)];
    if (titulo) mostrarExemplares(titulo);
  };
  // "Tentar de novo" da faixa de falha.
  tela.addEventListener('atualizar', () => termo && buscar());
  desenhar();
}
