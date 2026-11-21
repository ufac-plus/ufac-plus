// Seletor de semestre na aba Notas: a lista de semestres sai da mesma página de hoje (nenhum pedido a mais);
// um semestre anterior só é lido quando a pessoa o escolhe e fica no cache para sempre.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const banco = new Map();
// Atraso entre ler e devolver, como uma transação que leu o valor antigo: deixa a corrida de gravações à vista.
let atrasoLer = 0;
vi.mock('../src/lib/armazenamento.js', () => ({
  ler: async (k) => {
    const v = banco.get(k);
    if (atrasoLer && k === 'notas') await new Promise((r) => setTimeout(r, atrasoLer));
    return v;
  },
  gravar: async (k, v) => void banco.set(k, v),
  apagar: async (k) => void banco.delete(k),
  apagarTudo: async () => banco.clear(),
}));

const fixture = (nome) => readFileSync(resolve(__dirname, '../../fixtures', nome), 'utf8');
const { lerSemestresDeNotas, lerListaDeNotas } = await import('../src/lib/extratores/portal.js');
const { atualizarNotas, atualizarSemestre, listaDeSemestres, semestreEmCache, precisaLer } = await import('../src/lib/dados.js');

/** Ufac falsa pelo Worker: conta os pedidos para provar que nada é lido à toa. */
function ufacFalsa() {
  const pedidos = [];
  vi.stubGlobal('fetch', async (url) => {
    const u = new URL(url);
    const caminho = u.pathname.slice('/portal'.length) + u.search;
    pedidos.push(caminho);
    const corpo = caminho.includes('nota/nota.action')
      ? fixture('portal_notas.html')
      : caminho.includes('notaturma.action')
        ? fixture('portal_notaturma_ajax.html')
        : caminho.includes('turma.action')
          ? fixture('portal_turma.html')
          : '<p></p>';
    return new Response(corpo, { status: 200, headers: { 'X-Url-Final': `https://portal.ufac.br${caminho}` } });
  });
  return pedidos;
}

beforeEach(() => {
  atrasoLer = 0;
  banco.clear();
  banco.set('idInterno', '44444');
});

describe('extrator: todos os semestres da página de Notas', () => {
  test('mais recente primeiro, com as disciplinas de cada um', () => {
    const s = lerSemestresDeNotas(fixture('portal_notas.html'));
    expect(s.map((x) => x.semestre)).toEqual(['2° Semestre / 2026', '1° Semestre / 2026']);
    expect(s[0].disciplinas.map((d) => d.disciplina)).toEqual(['Disciplina Atual', 'Outra Disciplina']);
    expect(s[1].disciplinas.map((d) => `${d.disciplina}|${d.situacao}`)).toEqual(['Disciplina Antiga|Aprovado']);
    // O quadro do semestre antigo vem por outro pedido (o mesmo notaturma), não no HTML da página.
    expect(s[1].disciplinas[0].urlNotas).toContain('idCurricAluno=900010003');
    expect(s[1].disciplinas[0].urlNotas).toContain('periodo=101');
    expect(s[1].disciplinas[0].urlTurma).toBe('https://portal.ufac.br/aluno/aluno/turma.action?turma=10003');
  });
  test('ordena pelo ano e semestre mesmo se a página vier fora de ordem', () => {
    const pagina = fixture('portal_notas.html');
    const [, antes, depois] = pagina.split(/(?=<h3>)/);
    const invertida = pagina.replace(antes + depois, depois + antes);
    expect(lerSemestresDeNotas(invertida).map((x) => x.semestre)).toEqual(['2° Semestre / 2026', '1° Semestre / 2026']);
  });
  test('página de login não vira dado; a lista antiga continua igual', () => {
    expect(lerSemestresDeNotas(fixture('public/portal_login.html'))).toBeNull();
    expect(lerListaDeNotas(fixture('portal_notas.html')).semestre).toBe('2° Semestre / 2026');
  });
  test('o mais recente sem tabela não deixa um semestre encerrado virar o atual', () => {
    const pagina = fixture('portal_notas.html').replace('<h3>', '<h3><a href="#" class="accordionTurma">1° Semestre / 2027</a></h3><div><p>Sem turmas</p></div><h3>');
    expect(lerSemestresDeNotas(pagina)).toBeNull();
    expect(lerListaDeNotas(pagina)).toBeNull();
  });
  test('um semestre antigo sem tabela é só pulado', () => {
    const pagina = fixture('portal_notas.html').replace('</div>\n</div></div></div></div>', '</div>\n<h3><a href="#" class="accordionTurma">2° Semestre / 2025</a></h3><div></div>\n</div></div></div></div>');
    expect(pagina).toContain('2025');
    expect(lerSemestresDeNotas(pagina).map((x) => x.semestre)).toEqual(['2° Semestre / 2026', '1° Semestre / 2026']);
  });
});

describe('cache dos semestres (funções puras)', () => {
  const agora = new Date('2026-11-21T12:00:00Z').getTime();
  const cache = {
    semestre: '2° Semestre / 2026',
    disciplinas: [{ disciplina: 'Disciplina Atual' }],
    lidoEm: '2026-11-21T10:00:00Z',
    semestres: [
      { semestre: '2° Semestre / 2026', disciplinas: [] },
      { semestre: '1° Semestre / 2026', disciplinas: [] },
    ],
    anteriores: { '1° Semestre / 2026': { semestre: '1° Semestre / 2026', disciplinas: [{ disciplina: 'Disciplina Antiga' }], lidoEm: '2026-08-01T10:00:00Z' } },
  };

  test('lista com o atual marcado; cache antigo (sem semestres) mostra só o atual', () => {
    expect(listaDeSemestres(cache)).toEqual([
      { semestre: '2° Semestre / 2026', atual: true },
      { semestre: '1° Semestre / 2026', atual: false },
    ]);
    expect(listaDeSemestres({ semestre: '2° Semestre / 2026', disciplinas: [], lidoEm: 'x' })).toEqual([{ semestre: '2° Semestre / 2026', atual: true }]);
    expect(listaDeSemestres(undefined)).toEqual([]);
  });
  test('escolhe o semestre do cache', () => {
    expect(semestreEmCache(cache, null)).toMatchObject({ semestre: '2° Semestre / 2026', atual: true });
    expect(semestreEmCache(cache, '2° Semestre / 2026').atual).toBe(true);
    expect(semestreEmCache(cache, '1° Semestre / 2026')).toMatchObject({ disciplinas: [{ disciplina: 'Disciplina Antiga' }], atual: false });
    expect(semestreEmCache({ ...cache, anteriores: undefined }, '1° Semestre / 2026')).toBeNull();
    expect(semestreEmCache(undefined, null)).toBeNull();
  });
  test('o atual relê depois de 6 h; o anterior, só se nunca foi lido', () => {
    expect(precisaLer(cache, null, agora)).toBe(false);
    expect(precisaLer(cache, null, agora + 5 * 3600 * 1000)).toBe(true);
    expect(precisaLer(undefined, null, agora)).toBe(true);
    expect(precisaLer(cache, '1° Semestre / 2026', agora + 365 * 24 * 3600 * 1000)).toBe(false);
    expect(precisaLer({ ...cache, anteriores: {} }, '1° Semestre / 2026', agora)).toBe(true);
  });
});

describe('leitura na Ufac', () => {
  test('o semestre atual faz os mesmos pedidos de antes e guarda a lista de semestres', async () => {
    const pedidos = ufacFalsa();
    const n = await atualizarNotas();
    // Página de Notas + quadro e turma de cada uma das 2 disciplinas atuais. Nada do semestre antigo.
    expect(pedidos.length).toBe(5);
    expect(pedidos.some((p) => p.includes('900010003') || p.includes('turma=10003'))).toBe(false);
    expect(n.semestre).toBe('2° Semestre / 2026');
    expect(n.disciplinas.map((d) => d.disciplina)).toEqual(['Disciplina Atual', 'Outra Disciplina']);
    expect(banco.get('notas').semestres.map((s) => s.semestre)).toEqual(['2° Semestre / 2026', '1° Semestre / 2026']);
  });

  test('o anterior é lido só quando escolhido, sem reler a página de Notas, e fica guardado', async () => {
    const pedidos = ufacFalsa();
    await atualizarNotas();
    pedidos.length = 0;
    const s = await atualizarSemestre('1° Semestre / 2026');
    expect(pedidos.length).toBe(2); // quadro + carga horária da única disciplina
    expect(pedidos.some((p) => p.includes('nota/nota.action'))).toBe(false);
    expect(s).toMatchObject({ semestre: '1° Semestre / 2026', atual: false });
    expect(s.disciplinas[0]).toMatchObject({ disciplina: 'Disciplina Antiga', media: '8,0', cargaHoraria: 60 });
    const cache = banco.get('notas');
    expect(cache.semestre).toBe('2° Semestre / 2026'); // as outras telas continuam vendo o atual
    expect(precisaLer(cache, '1° Semestre / 2026')).toBe(false);
    // Reler o atual não apaga o anterior guardado.
    await atualizarNotas();
    expect(banco.get('notas').anteriores['1° Semestre / 2026'].disciplinas.length).toBe(1);
  });

  test('cache antigo (sem a lista de semestres) continua abrindo e ganha a lista na próxima leitura', async () => {
    banco.set('notas', { semestre: '2° Semestre / 2026', disciplinas: [{ disciplina: 'Disciplina Atual', cargaHoraria: 30 }], lidoEm: '2026-11-01T10:00:00Z' });
    expect(semestreEmCache(banco.get('notas'), null).disciplinas.length).toBe(1);
    const pedidos = ufacFalsa();
    await atualizarNotas();
    // A carga horária já conhecida não é pedida de novo.
    expect(pedidos.filter((p) => p.includes('turma=10001')).length).toBe(0);
    expect(banco.get('notas').disciplinas[0].cargaHoraria).toBe(30);
    expect(listaDeSemestres(banco.get('notas')).length).toBe(2);
  });

  test('ler o atual e um anterior ao mesmo tempo não perde nenhum dos dois no cache', async () => {
    ufacFalsa();
    const depois = (ms, f) => new Promise((r) => setTimeout(r, ms)).then(f);
    // Vários desencontros entre as duas leituras, como quando a pessoa troca de semestre com o atual carregando.
    for (const atraso of [0, 5, 10, 15, 20, 30]) {
      atrasoLer = 0;
      banco.delete('notas');
      await atualizarNotas();
      const lidoAntes = banco.get('notas').lidoEm;
      await new Promise((r) => setTimeout(r, 2));
      atrasoLer = 20;
      await Promise.all([depois(atraso, () => atualizarSemestre('1° Semestre / 2026')), atualizarNotas()]);
      const cache = banco.get('notas');
      expect(cache.lidoEm, `atraso ${atraso}`).not.toBe(lidoAntes);
      expect(cache.anteriores['1° Semestre / 2026']?.disciplinas.length, `atraso ${atraso}`).toBe(1);
    }
  });

  test('semestre que não está na lista não faz pedido nenhum', async () => {
    const pedidos = ufacFalsa();
    await atualizarNotas();
    pedidos.length = 0;
    await expect(atualizarSemestre('1° Semestre / 2020')).rejects.toThrow();
    expect(pedidos.length).toBe(0);
  });
});
