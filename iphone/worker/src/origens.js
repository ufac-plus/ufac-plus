// Lista de origens do PWA. Em produção, só ORIGENS. Os endereços locais (ORIGENS_DEV) entram só com
// DEV_LOCAL=1, que o "npm run dev" passa ao wrangler: assim um site aberto em localhost na máquina de
// qualquer pessoa não consegue usar o Worker publicado.
const separar = (texto) =>
  (texto ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

export function listaDeOrigens(env) {
  return [...separar(env.ORIGENS), ...(env.DEV_LOCAL === '1' ? separar(env.ORIGENS_DEV) : [])];
}
