// Pesquisa no acervo da Biblioteca (pública: não precisa do login do Portal). Vai pelo Worker, como o resto.
// Respeito à Ufac: só busca quando a pessoa toca em Buscar, e guarda as últimas buscas por algumas horas.
import { enderecoDaUltimaPagina, lerPagina, pedir, SemConexao } from './api.js';
import { gravar, ler } from './armazenamento.js';
import { ErroLeitura } from './dados.js';
import { ehRequisicaoIncompleta, lerExemplares, lerHistoricoBiblioteca, lerResultadoAcervo } from './extratores/biblioteca.js';
import { diagnosticoPagina } from './extratores/portal.js';
import { registrar, semParametros } from './registro.js';

export const VALIDADE_BUSCA_MS = 6 * 60 * 60 * 1000;
export const VALIDADE_EXEMPLARES_MS = 60 * 60 * 1000; // a situação (emprestado/disponível) muda mais rápido
export const VALIDADE_HISTORICO_MS = 6 * 60 * 60 * 1000;
const MAX_BUSCAS = 5;
const MAX_EXEMPLARES = 20;

export const caminhoBusca = (termo) => `/biblioteca/pesquisa/resultado.action?keyword=${encodeURIComponent(termo)}`;
// A Biblioteca só reconhece a pessoa depois de entrar pelo link com o número interno (como no Android).
export const caminhoEntradaBiblioteca = (id) => `/biblioteca/pesquisa/pesquisar.action?matricula=${id}`;
export const caminhoMeuEspacoBiblioteca = '/biblioteca/usuario/index.action';
export const caminhoMolduraHistorico = '/biblioteca/usuario/emprestimo/historico.action';
export const caminhoHistorico = '/biblioteca/usuario/emprestimo/gridhistorico.action?_search=false&rows=100&page=1&sidx=dataRetirada&sord=desc';
const OPCOES_GRID = { xhr: true, accept: 'application/json, text/javascript, */*; q=0.01' };

export class ErroBibliotecaNoSite extends Error {}
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
  // semSessao: a pesquisa pública não precisa nem grava cookies, então nunca cria sessão anônima em /biblioteca/.
  const r = await pedir('portal', caminho, { semSessao: true });
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

// ---------- Meus empréstimos (precisa do login do Portal) ----------

/** O que já foi lido (mesmo vencido), para mostrar enquanto atualiza ou quando a sessão caiu. */
export const historicoGuardado = () => ler('bibliotecaHistorico');

/**
 * Histórico de empréstimos: { lidoEm, lista }. Lê no máximo a cada 6 horas (ou ao puxar para atualizar).
 * Null quando não há como ler agora (sem número interno ainda, ou sessão do Portal encerrada).
 * Lança SemConexao ou ErroLeitura (o histórico guardado fica intacto).
 */
export async function lerHistoricoEmprestimos({ forcar = false, agora = Date.now() } = {}) {
  const guardado = await historicoGuardado();
  if (!forcar && guardado && agora - new Date(guardado.lidoEm).getTime() < VALIDADE_HISTORICO_MS) return guardado;
  const id = await ler('idInterno');
  if (!id) return null;
  // novaBiblioteca descarta qualquer JSESSIONID anônimo/antigo de /biblioteca/ antes de entrar com o número interno.
  if ((await lerPagina('portal', caminhoEntradaBiblioteca(id), { novaBiblioteca: true })) === null) return null;
  let texto = await lerPagina('portal', caminhoHistorico, OPCOES_GRID);
  if (texto === null) return null;
  let lista = lerHistoricoBiblioteca(texto);
  if (!lista) {
    // Se houve reentrada automática no Portal ou o ASTEN exige passar por Meu Espaço › Histórico antes do jqGrid,
    // refaz o caminho completo da própria página oficial uma vez.
    if ((await lerPagina('portal', caminhoEntradaBiblioteca(id), { novaBiblioteca: true })) === null) return null;
    const espaco = await lerPagina('portal', caminhoMeuEspacoBiblioteca);
    if (espaco === null) return null;
    if (!ehRequisicaoIncompleta(espaco, enderecoDaUltimaPagina())) {
      const moldura = await lerPagina('portal', caminhoMolduraHistorico);
      if (moldura === null) return null;
      if (!ehRequisicaoIncompleta(moldura, enderecoDaUltimaPagina())) {
        texto = await lerPagina('portal', caminhoHistorico, OPCOES_GRID);
        if (texto === null) return null;
        lista = lerHistoricoBiblioteca(texto);
      } else {
        texto = moldura;
      }
    } else {
      texto = espaco;
    }
  }
  if (!lista) {
    const urlFinal = enderecoDaUltimaPagina();
    registrar('leitura', { o: 'histórico da Biblioteca', ...diagnosticoPagina(texto, urlFinal) });
    if (ehRequisicaoIncompleta(texto, urlFinal)) {
      throw new ErroBibliotecaNoSite(
        'O site da Biblioteca respondeu "Requisição Incompleta" para sua conta. Isso costuma acontecer quando o cadastro na Biblioteca ainda não foi ativado no balcão ou quando o módulo da Biblioteca está instável.',
      );
    }
    throw new ErroLeitura('Não consegui ler seus empréstimos agora.');
  }
  const entrada = { lidoEm: new Date(agora).toISOString(), lista };
  await gravar('bibliotecaHistorico', entrada);
  return entrada;
}
