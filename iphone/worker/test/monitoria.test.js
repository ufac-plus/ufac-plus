// Aviso de edital novo de monitoria na Prograd (Worker). Nada de dado pessoal: só o sim/não do aviso e endereços públicos.
import { createECDH } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { dispararAgendados, inscrever, validarAgenda } from '../src/agenda.js';
import { CHAVE_MONITORIA, editaisDeMonitoria, enderecoBuscaPrograd, INTERVALO_MONITORIA_MS, novosEditaisMonitoria } from '../src/monitoria.js';
import { paraBase64Url } from '../src/base64.js';

const item = (slug, titulo, tipo = 'Folder') => ({ '@id': `https://www3.ufac.br/prograd/2026/${slug}`, '@type': tipo, title: titulo, effective: '2026-11-05T22:16:47+00:00' });
const listagem = (...itens) => ({ items: itens, items_total: itens.length });
const A = item('edital-prograd-no-10-2026-selecao-de-monitores', 'Edital Prograd nº 10/2026 - Seleção de Monitores 2026.2');
const B = item('edital-prograd-no-47-2026-pet', 'Edital Prograd nº 47/2026 - Seleção de Bolsistas para o Grupo PET Agronomia', 'Link');
const C = item('edital-prograd-no-11-2026-monitoria-promaed', 'Edital Prograd nº 11/2026 - Promaed: monitoria de apoio ao estudante');

function kvFalso() {
  const kv = new Map();
  return {
    kv,
    INSCRICOES: {
      put: async (k, v) => kv.set(k, v),
      get: async (k) => JSON.parse(kv.get(k) ?? 'null'),
      delete: async (k) => kv.delete(k),
      list: async ({ prefix = '' } = {}) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    },
  };
}
const respostaJson = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('leitura dos editais de monitoria', () => {
  test('só os de monitoria, com endereço da Ufac', () => {
    const lista = editaisDeMonitoria(listagem(A, B, C, { '@id': 'https://exemplo.org/monitoria', '@type': 'Folder', title: 'Monitoria de fora' }));
    expect(lista.map((e) => e.titulo)).toEqual(['Edital Prograd nº 10/2026 - Seleção de Monitores 2026.2', 'Edital Prograd nº 11/2026 - Promaed: monitoria de apoio ao estudante']);
    expect(lista[0].codigo).toBe('edital-prograd-no-10-2026-selecao-de-monitores');
    expect(editaisDeMonitoria(null)).toBeNull();
    expect(editaisDeMonitoria({ nada: 1 })).toBeNull();
  });
  test('busca do ano pelo site público, sem login', () => {
    const u = new URL(enderecoBuscaPrograd(2026));
    expect(u.origin + u.pathname).toBe('https://www3.ufac.br/prograd/@search');
    expect(u.searchParams.get('path.query')).toBe('/prograd/2026');
  });
});

describe('novos editais de monitoria', () => {
  const t0 = Date.UTC(2026, 10, 26, 12, 0);

  test('a primeira leitura só marca o que já existe: nada de aviso de edital antigo', async () => {
    const env = kvFalso();
    expect(await novosEditaisMonitoria(env, t0, async () => respostaJson(listagem(A)))).toEqual([]);
    expect(JSON.parse(env.kv.get(CHAVE_MONITORIA)).vistos).toEqual([A['@id']]);
  });

  test('depois, só o que ainda não tinha sido visto; no máximo uma conferência a cada 6 h', async () => {
    const env = kvFalso();
    await novosEditaisMonitoria(env, t0, async () => respostaJson(listagem(A)));
    let pedidos = 0;
    const f = async () => (pedidos++, respostaJson(listagem(C, A)));
    expect(await novosEditaisMonitoria(env, t0 + 60_000, f)).toEqual([]); // cedo demais
    expect(pedidos).toBe(0);
    const novos = await novosEditaisMonitoria(env, t0 + INTERVALO_MONITORIA_MS + 1, f);
    expect(novos.map((e) => e.url)).toEqual([C['@id']]);
    expect(await novosEditaisMonitoria(env, t0 + 2 * INTERVALO_MONITORIA_MS + 2, f)).toEqual([]); // já visto
  });

  test('falha de rede ou resposta estranha não marca nada e tenta de novo depois', async () => {
    const env = kvFalso();
    await novosEditaisMonitoria(env, t0, async () => respostaJson(listagem(A)));
    const antes = env.kv.get(CHAVE_MONITORIA);
    const tarde = t0 + INTERVALO_MONITORIA_MS + 1;
    expect(await novosEditaisMonitoria(env, tarde, async () => { throw new Error('fora'); })).toEqual([]);
    expect(await novosEditaisMonitoria(env, tarde, async () => respostaJson({}, 503))).toEqual([]);
    expect(await novosEditaisMonitoria(env, tarde, async () => respostaJson({ lixo: true }))).toEqual([]);
    expect(env.kv.get(CHAVE_MONITORIA)).toBe(antes);
  });
});

describe('aviso no cron', () => {
  async function ambiente(monitoria) {
    const env = kvFalso();
    const iphone = createECDH('prime256v1');
    iphone.generateKeys();
    const inscricao = { endpoint: 'https://web.push.apple.com/mon', keys: { p256dh: paraBase64Url(iphone.getPublicKey()), auth: paraBase64Url(new Uint8Array(16)) } };
    await inscrever(env, { inscricao, agenda: { semanais: [], unicos: [], monitoria } });
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    env.VAPID_PUBLICA = paraBase64Url(await crypto.subtle.exportKey('raw', par.publicKey));
    env.VAPID_PRIVADA = (await crypto.subtle.exportKey('jwk', par.privateKey)).d;
    env.VAPID_ASSUNTO = 'https://x.dev';
    return env;
  }
  const t0 = Date.UTC(2026, 10, 26, 12, 0);

  test('a agenda aceita só sim ou não', () => {
    expect(validarAgenda({ monitoria: true }).monitoria).toBe(true);
    expect(validarAgenda({ monitoria: 'sim' }).monitoria).toBe(false);
    expect(validarAgenda({}).monitoria).toBe(false);
  });

  test('quem ligou recebe o edital novo; a Ufac só é consultada quando há inscrito', async () => {
    const env = await ambiente(true);
    const envios = [];
    let ufac = 0;
    const fetcher = async (url, init) => {
      if (String(url).startsWith('https://www3.ufac.br/')) {
        ufac++;
        return respostaJson(listagem(ufac === 1 ? A : C, ...(ufac === 1 ? [] : [A])));
      }
      envios.push(init);
      return new Response('', { status: 201 });
    };
    expect(await dispararAgendados(env, t0, fetcher)).toBe(0); // 1ª leitura: só marca
    expect(await dispararAgendados(env, t0 + INTERVALO_MONITORIA_MS + 1, fetcher)).toBe(1);
    expect(envios).toHaveLength(1);
    expect(envios[0].headers['Content-Encoding']).toBe('aes128gcm');
  });

  test('sem ninguém inscrito no aviso, não consulta a Ufac', async () => {
    const env = await ambiente(false);
    let ufac = 0;
    await dispararAgendados(env, t0, async (url) => (String(url).startsWith('https://www3.ufac.br/') && ufac++, respostaJson(listagem())));
    expect(ufac).toBe(0);
  });

  test('inscrição morta (410) é apagada', async () => {
    const env = await ambiente(true);
    await dispararAgendados(env, t0, async () => respostaJson(listagem(A)));
    await dispararAgendados(env, t0 + INTERVALO_MONITORIA_MS + 1, async (url) => (String(url).startsWith('https://www3.ufac.br/') ? respostaJson(listagem(C, A)) : new Response('', { status: 410 })));
    expect([...env.kv.keys()].filter((k) => k.startsWith('i:'))).toEqual([]);
  });
});
