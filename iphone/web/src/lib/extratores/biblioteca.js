// Biblioteca da Ufac (pesquisa pública no acervo). Porte de lib/extractors/biblioteca.dart do Android.
import { filhos, limpo, parse } from './comum.js';

const ouNulo = (t) => limpo(t) || null;
const semPontoFinal = (t) => t.replace(/\.$/, '');

/**
 * Resultado de "Pesquisar Acervo" (resultado.action?keyword=). Null se a página não for o resultado;
 * lista vazia se nada foi achado. Cada título: { idRegistro, titulo, subtitulo, autor, ano, biblioteca }.
 */
export function lerResultadoAcervo(pagina) {
  const tabela = parse(pagina).querySelector('table.resultado-pesquisa-geral');
  if (!tabela) return null;
  const lista = [];
  for (const tr of tabela.querySelectorAll('tbody tr')) {
    const id = tr.getAttribute('idregistro');
    const titulo = ouNulo(tr.querySelector('[idd="titulo"]')?.textContent);
    const cels = filhos(tr, 'td');
    if (!id || !titulo || cels.length < 5) continue;
    const ano = ouNulo(cels[3].textContent);
    lista.push({
      idRegistro: id,
      titulo: semPontoFinal(titulo),
      subtitulo: ouNulo(tr.querySelector('[idd="subtitulo"]')?.textContent),
      autor: ouNulo(tr.querySelector('[idd="autor"]')?.textContent),
      ano: ano ? semPontoFinal(ano) : null, // "2019." vira "2019"
      biblioteca: ouNulo(cels[4].textContent),
    });
  }
  return lista;
}

/** "Título: subtítulo", como no Android. */
export const tituloCompleto = (t) => (t.subtitulo ? `${t.titulo}: ${t.subtitulo}` : t.titulo);

/**
 * Exemplares de um título (ajax/exemplar/itens.action). Null se a resposta não for a tabela de exemplares.
 * As colunas são achadas pelo nome do cabeçalho, não pela posição.
 */
export function lerExemplares(pagina) {
  const tabela = parse(pagina).querySelector('table.itens');
  if (!tabela) return null;
  const titulos = [...tabela.querySelectorAll('thead th')].map((th) => limpo(th.textContent).toLowerCase());
  const coluna = (inicio) => titulos.findIndex((t) => t.startsWith(inicio));
  const iLocal = coluna('locali');
  const iBib = coluna('biblio');
  const iCol = coluna('cole');
  const iTipo = coluna('tipo');
  const iReg = coluna('regul');
  const iSit = coluna('situa');
  if (iLocal < 0 || iSit < 0) return null;
  const celula = (cels, i) => (i < 0 || i >= cels.length ? null : ouNulo(cels[i].textContent));
  const lista = [];
  for (const tr of tabela.querySelectorAll('tbody tr')) {
    const cels = filhos(tr, 'td');
    const localizacao = celula(cels, iLocal);
    const situacao = celula(cels, iSit);
    if (!localizacao || !situacao) continue;
    lista.push({
      localizacao,
      biblioteca: celula(cels, iBib) ?? '',
      situacao,
      colecao: celula(cels, iCol),
      tipo: celula(cels, iTipo),
      regulamento: celula(cels, iReg),
      disponivel: situacao.toLowerCase().startsWith('dispon'),
    });
  }
  return lista;
}
