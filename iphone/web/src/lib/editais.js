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
  proex: { nome: 'Proex', sobre: 'Extensão, cultura e esporte' },
};

export const VALIDADE_EDITAIS_MS = 6 * 60 * 60 * 1000;
const POR_PEDIDO = 100; // um ano inteiro cabe num pedido (22 a 50 editais por ano)

export const enderecoPasta = (fonte, ano) => `https://www3.ufac.br/${fonte}/${ano}`;

export function enderecoBusca(fonte, ano) {
  const q = new URLSearchParams({ 'path.query': `/${fonte}/${ano}`, 'path.depth': '1', sort_on: 'effective', sort_order: 'descending', b_size: String(POR_PEDIDO) });
  q.append('metadata_fields', 'effective');
  q.append('metadata_fields', 'modified');
  q.append('metadata_fields', 'description');
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

// ---------- Monitoria e horas complementares ----------

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Edital de monitoria (a Prograd chama de monitoria, monitores ou Promaed). */
export const ehEditalMonitoria = (e) => /\b(monitoria|monitores?|promaed)\b/.test(semAcento(`${e?.titulo} ${e?.descricao} ${e?.url}`));

// Editais que só pagam ou ajudam a pagar algo: não geram certificado de atividade complementar.
const SO_AUXILIO = /\b(auxilio|passe|transporte|moradia|primeira infancia|vagas? residuais?|sisu|transferencia|heteroidentificacao|parceiros? em saude|apoio para apresentacao|bolsista administrativo|pro-?pcd|acolhe)\b/;

// Da mais específica para a mais geral. A Ufac não escreve as horas no título: depende do certificado e do PPC.
const CATEGORIAS = [
  { categoria: 'Monitoria', teste: /\b(monitoria|monitores?|promaed)\b/, faixa: '~30 a 60 h', quando: ' por semestre' },
  { categoria: 'Ensino · PET', teste: /\b(pet|pibid|residencia pedagogica)\b/, faixa: '~30 a 60 h', quando: ' por semestre' },
  { categoria: 'Pesquisa', teste: /\b(pibic|pibiti|iniciacao cientifica|pesquisa)\b/, faixa: '~30 a 60 h', quando: ' por semestre' },
  { categoria: 'Bolsa acadêmica', teste: /\b(brinquedotecas?|bolsistas?|apoio pedagogico)\b/, faixa: '~30 a 60 h', quando: '' },
  { categoria: 'Extensão', teste: /\b(programas? de extensao|acoes (regionais )?de extensao|extensao universitaria|projetos? de extensao|cursinho)\b/, faixa: '~30 a 60 h', quando: '' },
  { categoria: 'Evento', teste: /\b(semanas? academicas?|cursos? de (extensao|formacao|capacitacao|linguas|idiomas)|congressos?|simposios?|seminarios?|oficinas?|minicursos?|hackathon|mostra|eventos?)\b/, faixa: '~10 a 40 h', quando: ' (pelo certificado)' },
  { categoria: 'Cultura / Esporte', teste: /\b(musica|coral|teatro|cultura|pro-?esporte|jubs)\b/, faixa: '~15 a 30 h', quando: '' },
];

/** Horas escritas no próprio edital (só com contexto de certificado ou carga; "20 horas semanais" não conta). */
function horasEscritas(texto) {
  const m = /(?:carga horaria(?: total)?(?: de)?|certificado de|equivalente a)\s*(\d{1,3})\s*h/.exec(texto) ?? /\b(\d{2,3})\s*horas?\s*(?:de atividades? complementares|complementares)/.exec(texto);
  if (!m) return null;
  const n = Number(m[1]);
  // "carga horária de 12 h semanais" é a dedicação por semana, não o total do certificado.
  return n > 0 && !/^(?:oras?)?\s*(?:semanais|por semana|\/\s*semana)/.test(texto.slice(m.index + m[0].length)) ? n : null;
}

/**
 * Quantas horas complementares um edital costuma render. { categoria, horas, rotulo, estimado } ou null quando
 * o edital não gera atividade complementar (auxílios, vagas, cadastros). Sem horas escritas, é só a faixa
 * típica da categoria: o aproveitamento real é o do PPC de cada curso (por isso sempre `estimado`).
 */
export function infoHorasComplementares(edital) {
  const texto = semAcento(`${edital?.titulo} ${edital?.descricao}`);
  if (SO_AUXILIO.test(texto) && !/\b(monitoria|monitores?|promaed|pet)\b/.test(texto)) return null;
  const achada = CATEGORIAS.find((c) => c.teste.test(texto));
  const horas = horasEscritas(texto);
  if (horas) return { categoria: achada?.categoria ?? 'Atividade complementar', horas, rotulo: `${horas} h complementares`, estimado: false };
  return achada ? { categoria: achada.categoria, horas: null, rotulo: `${achada.faixa} complementares${achada.quando}`, estimado: true } : null;
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
