// Editais da Proaes e da Prograd: resposta JSON da busca do Plone (www3.ufac.br/<setor>/@search).
// Público, sem login. Null quando a resposta não é a listagem (nunca mostrar dado errado).

const HOST = 'https://www3.ufac.br/';
// Só o que é página de edital: pastas (edital + anexos + resultados), arquivos soltos e links.
const TIPOS = new Set(['Folder', 'File', 'Document', 'Link']);

const limpar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Data ISO válida, ou null (o Plone manda "None" ou nada quando a data não foi definida). */
function data(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  return Number.isNaN(new Date(s).getTime()) ? null : s;
}

/** Lista de { titulo, descricao, url, publicadoEm, atualizadoEm }, na ordem da Ufac (mais novo primeiro). */
export function lerEditais(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) return null;
  return json.items
    .filter((i) => i && TIPOS.has(i['@type']) && typeof i['@id'] === 'string' && i['@id'].startsWith(HOST) && limpar(i.title))
    .map((i) => ({ titulo: limpar(i.title), descricao: limpar(i.description), url: i['@id'], publicadoEm: data(i.effective), atualizadoEm: data(i.modified) }));
}
