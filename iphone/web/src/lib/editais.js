// Editais da Proaes (bolsas e auxílios) e da Prograd (graduação). A listagem é pública e a API do site da Ufac
// (www3.ufac.br, Plone) tem CORS aberto, então o iPhone lê direto, sem o Worker e sem cookies.
// Respeito à Ufac: lê só ao abrir a tela (ou puxar para atualizar) e guarda por algumas horas.
import { comLimite, LIMITE_PADRAO, SemConexao } from './api.js';
import { apagar, gravar, ler } from './armazenamento.js';
import { ErroLeitura } from './dados.js';
import { MESES, mesmoDia } from './dominio/formatos.js';
import { lerEditais } from './extratores/editais.js';
import { registrar } from './registro.js';

export const FONTES = {
  proaes: { nome: 'Proaes', sobre: 'Bolsas e auxílios estudantis' },
  prograd: { nome: 'Prograd', sobre: 'Monitoria, vagas residuais e outros' },
};

export const VALIDADE_EDITAIS_MS = 6 * 60 * 60 * 1000;
const POR_PEDIDO = 100; // um ano inteiro cabe num pedido (22 a 50 editais por ano)

export const enderecoPasta = (fonte, ano) => `https://www3.ufac.br/${fonte}/${ano}`;

export function enderecoBusca(fonte, ano) {
  const q = new URLSearchParams({ 'path.query': `/${fonte}/${ano}`, 'path.depth': '1', sort_on: 'effective', sort_order: 'descending', b_size: String(POR_PEDIDO) });
  q.append('metadata_fields', 'effective');
  q.append('metadata_fields', 'modified');
  return `https://www3.ufac.br/${fonte}/@search?${q}`;
}

const chave = (fonte) => `editais:${fonte}`;

/** O que já foi lido (mesmo vencido), para mostrar enquanto atualiza ou quando a Ufac não responde. */
export const editaisGuardados = (fonte) => ler(chave(fonte));

/** Para "Limpar dados salvos": tudo é lido de novo da Ufac na próxima abertura. */
export async function apagarEditaisGuardados() {
  for (const fonte of Object.keys(FONTES)) await apagar(chave(fonte));
}

async function lerAno(fonte, ano, buscar) {
  let r;
  try {
    r = await buscar(enderecoBusca(fonte, ano), { headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal: comLimite(LIMITE_PADRAO) });
  } catch {
    registrar('rede', { sistema: fonte, caminho: `/${fonte}/@search`, erro: 'sem resposta' });
    throw new SemConexao('Sem conexão');
  }
  if (r.status >= 400) {
    registrar('rede', { sistema: fonte, caminho: `/${fonte}/@search`, status: r.status });
    throw new SemConexao(`A Ufac respondeu ${r.status}`);
  }
  let lista;
  try {
    lista = lerEditais(await r.json());
  } catch {
    lista = null;
  }
  if (!lista) {
    registrar('leitura', { o: `editais da ${FONTES[fonte].nome}` });
    throw new ErroLeitura(`Não consegui ler os editais da ${FONTES[fonte].nome} agora.`);
  }
  return lista;
}

/**
 * Editais do ano: { fonte, ano, lidoEm, lista }. No começo do ano, enquanto a pasta nova está vazia, mostra os do
 * ano anterior. Lança SemConexao ou ErroLeitura (o cache antigo fica intacto).
 */
export async function lerEditaisDe(fonte, { forcar = false, agora = new Date(), buscar = (...a) => fetch(...a) } = {}) {
  const guardado = await editaisGuardados(fonte);
  if (!forcar && guardado && agora - new Date(guardado.lidoEm) < VALIDADE_EDITAIS_MS) return guardado;
  let ano = agora.getFullYear();
  let lista = await lerAno(fonte, ano, buscar);
  if (!lista.length) {
    ano -= 1;
    lista = await lerAno(fonte, ano, buscar);
  }
  const entrada = { fonte, ano, lidoEm: agora.toISOString(), lista };
  await gravar(chave(fonte), entrada);
  return entrada;
}

/** "6 de novembro", com o ano só quando não é o atual. */
function dia(iso, agora) {
  const d = new Date(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear() === agora.getFullYear() ? '' : ` de ${d.getFullYear()}`}`;
}

/** "Publicado em 6 de novembro · atualizado em 16 de novembro" (a atualização costuma ser um resultado novo). */
export function rotuloDatas({ publicadoEm, atualizadoEm }, agora = new Date()) {
  const partes = [];
  if (publicadoEm) partes.push(`Publicado em ${dia(publicadoEm, agora)}`);
  if (atualizadoEm && (!publicadoEm || (new Date(atualizadoEm) > new Date(publicadoEm) && !mesmoDia(new Date(atualizadoEm), new Date(publicadoEm))))) {
    partes.push(`${partes.length ? 'atualizado' : 'Atualizado'} em ${dia(atualizadoEm, agora)}`);
  }
  return partes.join(' · ');
}
