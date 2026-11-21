// Pesquisa no acervo da Biblioteca (pública: não precisa do login do Portal). Vai pelo Worker, como o resto.
// Respeito à Ufac: só busca quando a pessoa toca em Buscar, e guarda as últimas buscas por algumas horas.
import { pedir, SemConexao } from './api.js';
import { gravar, ler } from './armazenamento.js';
import { ErroLeitura } from './dados.js';
import { lerExemplares, lerResultadoAcervo } from './extratores/biblioteca.js';
import { registrar, semParametros } from './registro.js';

export const VALIDADE_BUSCA_MS = 6 * 60 * 60 * 1000;
export const VALIDADE_EXEMPLARES_MS = 60 * 60 * 1000; // a situação (emprestado/disponível) muda mais rápido
const MAX_BUSCAS = 5;
const MAX_EXEMPLARES = 20;

export const caminhoBusca = (termo) => `/biblioteca/pesquisa/resultado.action?keyword=${encodeURIComponent(termo)}`;
export const caminhoExemplares = (t) =>
  `/biblioteca/ajax/exemplar/itens.action?${new URLSearchParams({ idRegistro: t.idRegistro, titulo: t.titulo, subtitulo: '', autor: t.autor ?? '' })}`;

/** "  Direito   CIVIL " e "direito civil" são a mesma busca no cache. */
export const normalizarTermo = (termo) => String(termo ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Entrada ainda válida do cache (lista de { chave, lidoEm, lista }), ou null. */
export function doCache(entradas, chave, validadeMs, agora = Date.now()) {
  const e = (entradas ?? []).find((x) => x.chave === chave);
  return e && agora - new Date(e.lidoEm).getTime() < validadeMs ? e : null;
}

/** Põe a entrada nova na frente, tira a antiga de mesma chave e as vencidas, e guarda no máximo `max`. */
export function guardarNoCache(entradas, entrada, validadeMs, max, agora = Date.now()) {
  return [entrada, ...(entradas ?? []).filter((x) => x.chave !== entrada.chave && agora - new Date(x.lidoEm).getTime() < validadeMs)].slice(0, max);
}

async function lerPublica(caminho) {
  const r = await pedir('portal', caminho);
  if (r.status >= 400) {
    registrar('rede', { sistema: 'biblioteca', caminho: semParametros(caminho), status: r.status });
    throw new SemConexao(`A Biblioteca respondeu ${r.status}`);
  }
  let texto;
  try {
    texto = await r.resposta.text();
  } catch {
    throw new SemConexao('A página parou no meio');
  }
  return texto;
}

/** Busca no acervo. Devolve { lista, lidoEm }. Lança SemConexao ou ErroLeitura (com a frase para a pessoa). */
export async function buscarNoAcervo(termo) {
  const chave = normalizarTermo(termo);
  const cache = await ler('bibliotecaBuscas');
  const guardada = doCache(cache, chave, VALIDADE_BUSCA_MS);
  if (guardada) return guardada;
  const lista = lerResultadoAcervo(await lerPublica(caminhoBusca(termo.trim())));
  if (!lista) {
    registrar('leitura', { o: 'acervo da Biblioteca' });
    throw new ErroLeitura('Não consegui ler a pesquisa da Biblioteca agora.');
  }
  const entrada = { chave, termo: termo.replace(/\s+/g, ' ').trim(), lidoEm: new Date().toISOString(), lista };
  await gravar('bibliotecaBuscas', guardarNoCache(cache, entrada, VALIDADE_BUSCA_MS, MAX_BUSCAS));
  return entrada;
}

/** Exemplares de um título: { lista, lidoEm }. Lança como buscarNoAcervo. */
export async function exemplaresDoTitulo(titulo) {
  const chave = titulo.idRegistro;
  const cache = await ler('bibliotecaExemplares');
  const guardada = doCache(cache, chave, VALIDADE_EXEMPLARES_MS);
  if (guardada) return guardada;
  const lista = lerExemplares(await lerPublica(caminhoExemplares(titulo)));
  if (!lista) {
    registrar('leitura', { o: 'exemplares da Biblioteca' });
    throw new ErroLeitura('Não consegui ler os exemplares agora.');
  }
  const entrada = { chave, lidoEm: new Date().toISOString(), lista };
  await gravar('bibliotecaExemplares', guardarNoCache(cache, entrada, VALIDADE_EXEMPLARES_MS, MAX_EXEMPLARES));
  return entrada;
}
