// Aviso de edital novo de monitoria na Prograd. O Worker só olha o site público da Ufac (sem login, sem cookies)
// e só quando há alguém inscrito no aviso. Guarda no KV apenas os endereços públicos dos editais já vistos.
export const CHAVE_MONITORIA = 'meta:monitoria_prograd'; // o prefixo "meta:" não aparece na lista de inscrições ("i:")
export const INTERVALO_MONITORIA_MS = 6 * 3600 * 1000;
const MAX_VISTOS = 80;
const PRAZO_MS = 10000;
const HOST = 'https://www3.ufac.br/';
const EH_MONITORIA = /\b(monitoria|monitores?|promaed)\b/i;
const TIPOS = new Set(['Folder', 'File', 'Document', 'Link']);

export function enderecoBuscaPrograd(ano) {
  const q = new URLSearchParams({ 'path.query': `/prograd/${ano}`, 'path.depth': '1', sort_on: 'effective', sort_order: 'descending', b_size: '100' });
  q.append('metadata_fields', 'effective');
  q.append('metadata_fields', 'description');
  return `${HOST}prograd/@search?${q}`;
}

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Editais de monitoria da listagem do Plone: [{ url, titulo, codigo }]. Null se a resposta não for a listagem. */
export function editaisDeMonitoria(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) return null;
  return json.items
    .filter((i) => i && TIPOS.has(i['@type']) && typeof i['@id'] === 'string' && i['@id'].startsWith(HOST) && String(i.title ?? '').trim())
    .filter((i) => EH_MONITORIA.test(semAcento(`${i.title} ${i['@id']}`)))
    .map((i) => ({
      url: i['@id'],
      titulo: String(i.title).replace(/\s+/g, ' ').trim(),
      codigo: i['@id'].split('/').pop().replace(/[^\w.-]/g, '').slice(0, 60),
    }));
}

/**
 * Editais de monitoria que ainda não tinham sido vistos. A primeira leitura só marca o que já existe (nada de
 * aviso de edital antigo). No máximo uma conferência a cada 6 horas. Falha de rede: nada, tenta no próximo ciclo.
 */
export async function novosEditaisMonitoria(env, agoraMs, fetcher = fetch) {
  const estado = await env.INSCRICOES.get(CHAVE_MONITORIA, 'json');
  if (estado?.verificadoEm && agoraMs - estado.verificadoEm < INTERVALO_MONITORIA_MS) return [];
  const ano = new Date(agoraMs - 5 * 3600 * 1000).getUTCFullYear(); // ano em Rio Branco (UTC-5)
  let lista = null;
  try {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), PRAZO_MS);
    try {
      const r = await fetcher(enderecoBuscaPrograd(ano), { headers: { Accept: 'application/json' }, signal: controle.signal });
      if (r.ok) lista = editaisDeMonitoria(await r.json());
    } finally {
      clearTimeout(relogio);
    }
  } catch {
    lista = null;
  }
  if (!lista) return [];
  const vistosAntes = estado?.vistos ?? [];
  const novos = estado ? lista.filter((e) => !vistosAntes.includes(e.url)) : [];
  const vistos = [...new Set([...novos.map((e) => e.url), ...lista.map((e) => e.url), ...vistosAntes])].slice(0, MAX_VISTOS);
  await env.INSCRICOES.put(CHAVE_MONITORIA, JSON.stringify({ verificadoEm: agoraMs, vistos }));
  return novos;
}
