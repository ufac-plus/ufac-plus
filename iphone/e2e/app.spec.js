// Testa o PWA num iPhone emulado (WebKit), com um Worker falso que responde com as fixtures
// anonimizadas do projeto. Nenhum pedido vai para a Ufac.
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const PRINTS = resolve(import.meta.dirname, 'prints');
mkdirSync(PRINTS, { recursive: true });

// O Worker falso (e2e/worker-falso.mjs) roda em localhost:8787 e guarda o estado do login.
const WORKER = 'http://localhost:8787';

async function workerFalso(page) {
  await page.request.get(`${WORKER}/__reset`);
  return { pedidos: async () => (await page.request.get(`${WORKER}/__pedidos`)).json() };
}

/** Print depois que a tela nova assumiu (uma só .tela, visível) e as animações terminaram. */
async function print(page, nome, opcoes = {}) {
  await page.waitForFunction(() => document.querySelectorAll('main.tela').length <= 1 && !document.querySelector('main.tela[style*="hidden"]'));
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  await page.screenshot({ path: `${PRINTS}/${nome}.png`, ...opcoes });
}

async function entrar(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sou aluno' }).click();
  await page.getByLabel('CPF').fill('00000000000');
  await page.getByLabel('Senha do Portal do Aluno').fill('senha-de-teste');
  await expect(page.getByLabel('Conta salva no Chaves do iCloud')).toHaveValue('000.000.000-00 · Portal do Aluno');
  await page.getByRole('button', { name: 'Entrar no Portal' }).click();
  // Etapa 2: outra senha, outro item no Chaves.
  await expect(page.getByText('Agora, a senha do eTICKET')).toBeVisible();
  await expect(page.getByLabel('Conta salva no Chaves do iCloud')).toHaveValue('000.000.000-00 · eTICKET');
  await page.getByLabel('Senha do eTICKET').fill('senha-eticket');
  await page.getByRole('button', { name: 'Entrar no eTICKET' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Segunda-feira, 2/11/2026, 18h40 em Rio Branco.
  await page.clock.setFixedTime(new Date('2026-11-02T18:40:00-05:00'));
});

test('manifest e metas do iPhone', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icones/icone-180.png');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/#/inicio', lang: 'pt-BR' });
  for (const icone of manifest.icons) expect((await request.get(icone.src)).ok()).toBe(true);
  expect((await request.get('/icones/icone-180.png')).ok()).toBe(true);
  await expect(page.getByText('Não é um aplicativo oficial da Ufac')).toBeVisible();
  await print(page, '01-boas-vindas');
});

test('login em etapas, claro e escuro', async ({ page }) => {
  await workerFalso(page);
  await page.goto('/#/login/aluno');
  await page.getByLabel('CPF').fill('00000000000');
  await print(page, '12-login-portal');
  await page.getByLabel('Senha do Portal do Aluno').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar no Portal' }).click();
  await expect(page.getByText('Agora, a senha do eTICKET')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await print(page, '13-login-eticket-escuro');
  // Senha do Portal no eTICKET: o erro diz qual sistema recusou.
  await page.getByLabel('Senha do eTICKET').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar no eTICKET' }).click();
  await expect(page.getByText('O eTICKET não aceitou')).toBeVisible();
});

test('senha errada mostra erro humano', async ({ page }) => {
  await workerFalso(page);
  await page.goto('/#/login/aluno');
  await page.getByLabel('CPF').fill('00000000000');
  await page.getByLabel('Senha do Portal do Aluno').fill('errada');
  await page.getByRole('button', { name: 'Entrar no Portal' }).click();
  await expect(page.getByText('O Portal não aceitou o CPF ou a senha')).toBeVisible();
});

test('login em 2 etapas e telas do aluno', async ({ page }) => {
  const estado = await workerFalso(page);
  await entrar(page);
  // Os dois POSTs de login aconteceram, com a senha só no corpo.
  expect((await estado.pedidos()).filter((p) => p.startsWith('POST'))).toEqual(['POST /portal/aluno/j_security_check', 'POST /eticket/login/']);

  await expect(page.getByText('R$ 12,50').first()).toBeVisible();
  await expect(page.getByText('12345678901')).toBeVisible();
  await expect(page.getByText('Curso Exemplo · Ufac')).toBeVisible();
  await expect(page.getByText(/^Jantar · 18h$/)).toBeVisible();
  await print(page, '02-inicio-claro', { fullPage: true });

  await page.getByRole('link', { name: 'Horários' }).click();
  await expect(page.getByText('Disciplina Segunda')).toBeVisible();
  await print(page, '03-horarios');

  await page.getByRole('link', { name: 'Notas' }).click();
  await expect(page.getByText('Disciplina Atual')).toBeVisible();
  await page.getByText('Disciplina Atual').click();
  await expect(page.getByRole('cell', { name: 'Média Final' })).toBeVisible();
  await expect(page.getByText('4 de 16 faltas permitidas').first()).toBeVisible();
  await print(page, '04-notas');

  await page.getByRole('link', { name: 'Relatórios' }).click();
  await expect(page.getByText('Histórico Escolar CR – Aprovados (SIE)')).toBeVisible();
  await page.getByRole('button', { name: 'Visualizar Atestado de Matrícula' }).click();
  await expect(page.locator('iframe[title="Atestado de Matrícula"]')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await print(page, '05-relatorios');
  // Voltar do iPhone (histórico) leva à aba anterior.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Notas', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Relatórios', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'RU' }).click();
  await expect(page.getByRole('radio', { name: /Jantar/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('O cardápio do jantar ainda não saiu')).toBeVisible();
  await page.getByRole('radio', { name: /Café/ }).click();
  await expect(page.getByText('Café preto')).toBeVisible();
  await print(page, '06-ru');

  await page.getByRole('button', { name: 'Mostrar QR de entrada' }).click();
  const qr = page.getByRole('dialog', { name: 'QR do RU' });
  await expect(qr.locator('svg').first()).toBeVisible();
  await expect(qr.getByText('•••••••8901')).toBeVisible();
  await print(page, '07-qr');
});

test('Notas: trocar para um semestre anterior, lido só quando escolhido e guardado', async ({ page }) => {
  const worker = await workerFalso(page);
  await entrar(page);
  await page.getByRole('link', { name: 'Notas' }).click();
  await expect(page.getByText('Disciplina Atual')).toBeVisible();
  // A lista de semestres vem da mesma página: nenhum quadro do semestre antigo foi pedido.
  expect((await worker.pedidos()).some((p) => p.includes('idCurricAluno=900010003'))).toBe(false);
  // O nome acessível começa pelo texto visível (WCAG 2.5.3).
  await expect(page.getByRole('button', { name: '2º / 2026, trocar semestre' })).toBeVisible();
  const seletor = page.getByRole('button', { name: /trocar semestre/ });
  await expect(seletor).toContainText('2º / 2026');
  expect((await seletor.boundingBox()).height).toBeGreaterThanOrEqual(44);

  await seletor.click();
  const folha = page.getByRole('dialog', { name: 'Semestre' });
  await expect(folha.getByRole('button', { name: /2º \/ 2026/ })).toHaveAttribute('aria-current', 'true');
  await expect(folha.getByText('Atual')).toBeVisible();
  // Média discreta, só do que já foi lido, avisando que não é o CR.
  await expect(folha.getByText('Média das disciplinas')).toBeVisible();
  await expect(folha.getByText('1 disciplina de 1 semestre aberto no app, pela carga horária', { exact: false })).toBeVisible();
  await expect(folha.getByText('não o CR oficial', { exact: false })).toBeVisible();
  await print(page, '35-notas-semestres');
  await folha.getByRole('button', { name: /1º \/ 2026/ }).click();
  await expect(page.getByText('Disciplina Antiga')).toBeVisible();
  await expect(page.getByText('Disciplina Atual')).toHaveCount(0);
  await expect(seletor).toContainText('1º / 2026');
  await page.getByText('Disciplina Antiga').click();
  await expect(page.getByRole('cell', { name: 'Média Final' })).toBeVisible();
  const lidos = (await worker.pedidos()).filter((p) => p.includes('idCurricAluno=900010003')).length;
  expect(lidos).toBe(1);

  // Voltar ao atual e de novo ao antigo: o antigo sai do cache, sem pedido novo.
  await seletor.click();
  await page.getByRole('dialog', { name: 'Semestre' }).getByRole('button', { name: /2º \/ 2026/ }).click();
  await expect(page.getByText('Disciplina Atual')).toBeVisible();
  await seletor.click();
  await page.getByRole('dialog', { name: 'Semestre' }).getByRole('button', { name: /1º \/ 2026/ }).click();
  await expect(page.getByText('Disciplina Antiga')).toBeVisible();
  expect((await worker.pedidos()).filter((p) => p.includes('idCurricAluno=900010003')).length).toBe(1);
  await seletor.click();
  await expect(page.getByRole('dialog', { name: 'Semestre' }).getByText('2 disciplinas de 2 semestres abertos', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  // Semestre encerrado: nada de "quanto preciso no exame".
  await expect(page.getByText('no exame', { exact: false })).toHaveCount(0);

  // Esc fecha a folha sem trocar.
  await seletor.click();
  await expect(page.getByRole('dialog', { name: 'Semestre' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Semestre' })).toHaveCount(0);
  await expect(page.getByText('Disciplina Antiga')).toBeVisible();
});

test('Notas: falha no semestre anterior e "Tentar de novo" relê esse semestre', async ({ page }) => {
  const worker = await workerFalso(page);
  await entrar(page);
  await page.getByRole('link', { name: 'Notas' }).click();
  await expect(page.getByText('Disciplina Atual')).toBeVisible();
  await page.request.get(`${WORKER}/__falhar-antigo`);
  await page.getByRole('button', { name: /trocar semestre/ }).click();
  await page.getByRole('dialog', { name: 'Semestre' }).getByRole('button', { name: /1º \/ 2026/ }).click();
  const tentar = page.getByRole('button', { name: 'Tentar de novo' });
  await expect(tentar).toBeVisible();
  await expect(page.getByText('Disciplina Antiga')).toHaveCount(0);
  const antes = (await worker.pedidos()).filter((p) => p.includes('idCurricAluno=900010003')).length;
  await page.request.get(`${WORKER}/__falhar-antigo?ligado=nao`);
  await tentar.click();
  await expect(page.getByText('Disciplina Antiga')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  expect((await worker.pedidos()).filter((p) => p.includes('idCurricAluno=900010003')).length).toBe(antes + 1);
});

test('Notas: quanto preciso no exame, com a regra do Regimento', async ({ page }) => {
  await workerFalso(page);
  await entrar(page);
  await page.getByRole('link', { name: 'Notas' }).click();
  await page.getByText('Outra Disciplina').click();
  await expect(page.getByText('Para passar, você precisa de pelo menos 6,5 no exame')).toBeVisible();
  await expect(page.getByText('Média parcial 3,50', { exact: false })).toBeVisible();
  await expect(page.getByText('arts. 319 e 320', { exact: false })).toBeVisible();
  await page.evaluate(() => document.querySelector('.exame-necessario').scrollIntoView({ block: 'center' }));
  await print(page, '36-notas-exame');
  // A disciplina com média 8 não pede exame.
  await page.getByText('Disciplina Atual').click();
  await expect(page.getByText('no exame', { exact: false })).toHaveCount(0);
});

test('Portal entra sozinho quando a sessão cai, e para quando a chave é desligada', async ({ page }) => {
  const estado = await workerFalso(page);
  const loginsDoPortal = async () => (await estado.pedidos()).filter((p) => p === 'POST /portal/aluno/j_security_check').length;
  await page.goto('/#/login/aluno');
  await expect(page.getByLabel('Entrar sozinho quando a sessão cair')).toBeChecked();
  await entrar(page);
  expect(await loginsDoPortal()).toBe(1);

  // A sessão do Portal cai; o PDF abre mesmo assim, sem tela de login.
  await page.request.get(`${WORKER}/__expirar-portal`);
  await page.getByRole('link', { name: 'Relatórios' }).click();
  await page.getByRole('button', { name: 'Visualizar Atestado de Matrícula' }).click();
  await expect(page.locator('iframe[title="Atestado de Matrícula"]')).toBeVisible();
  expect(await loginsDoPortal()).toBe(2);
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Desligar a chave apaga a senha: com a sessão caída de novo, o app pede login.
  await page.goto('/#/configuracoes');
  await expect(page.getByRole('button', { name: /Esquecer senha salva/ })).toBeVisible();
  await page.getByText('Entrar sozinho quando a sessão cair').click();
  await expect(page.getByRole('button', { name: /Esquecer senha salva/ })).toBeHidden();
  await page.request.get(`${WORKER}/__expirar-portal`);
  await page.goto('/#/relatorios');
  await page.getByRole('button', { name: 'Visualizar Atestado de Matrícula' }).click();
  await expect(page.getByText('Senha do Portal do Aluno')).toBeVisible();
  expect(await loginsDoPortal()).toBe(2);
});

test('modo escuro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await workerFalso(page);
  await entrar(page);
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await print(page, '08-inicio-escuro', { fullPage: true });
  await page.getByRole('link', { name: 'RU' }).click();
  await expect(page.getByRole('button', { name: 'Mostrar QR de entrada' })).toBeVisible();
  await print(page, '09-ru-escuro');
});

test('abre offline com o QR do RU', async ({ page, context }) => {
  await workerFalso(page);
  await entrar(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa' })).toBeVisible();
  await expect(page.getByText('Não consegui falar com o eTICKET agora').or(page.getByText('R$ 12,50')).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar QR' }).click();
  await expect(page.getByRole('dialog', { name: 'QR do RU' }).getByText('Funciona offline')).toBeVisible();
  await print(page, '10-offline-qr');
});

test('sair apaga tudo', async ({ page }) => {
  await workerFalso(page);
  await entrar(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Sou aluno' })).toBeVisible();
  const restou = await page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open('ufacplus', 1);
    r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').count(); q.onsuccess = () => ok(q.result); };
  }));
  expect(restou).toBe(0);
});

test('páginas de instalação e privacidade', async ({ page }) => {
  await page.goto('/instalar/');
  await expect(page.getByRole('heading', { name: 'Adicionar à Tela de Início' })).toBeVisible();
  await print(page, '11-instalar', { fullPage: true });
  await page.goto('/privacidade/');
  await expect(page.getByRole('heading', { name: 'O repassador (Cloudflare Worker)' })).toBeVisible();
});

test.describe('Classroom', () => {
  // O Playwright não intercepta pedidos que passam pelo service worker.
  test.use({ serviceWorkers: 'block' });
test('conecta pelo Google (simulado) e mostra as atividades', async ({ page }) => {
  await workerFalso(page);
  // Google simulado: confere o pedido e volta para o app com o código.
  await page.route('https://accounts.google.com/**', (rota) => {
    const u = new URL(rota.request().url());
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('scope')).toContain('classroom.coursework.me.readonly');
    const volta = `${u.searchParams.get('redirect_uri')}?code=codigo-falso&state=${u.searchParams.get('state')}`;
    return rota.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(volta)})</script>` });
  });
  await page.route('https://classroom.googleapis.com/**', (rota) => {
    if (rota.request().method() === 'OPTIONS') {
      return rota.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' } });
    }
    expect(rota.request().headers().authorization).toMatch(/^Bearer A/);
    const u = new URL(rota.request().url());
    let corpo = {};
    if (u.pathname === '/v1/courses') corpo = { courses: [{ id: 'T1', name: 'Direito Civil VII', alternateLink: 'https://classroom.google.com/c/T1' }] };
    else if (u.pathname.endsWith('/courseWork')) corpo = { courseWork: [{ id: 'W1', title: 'Fichamento do capítulo 3', dueDate: { year: 2026, month: 11, day: 3 }, dueTime: { hours: 23, minutes: 59 }, alternateLink: 'https://classroom.google.com/c/T1/a/W1' }] };
    else corpo = { studentSubmissions: [{ courseWorkId: 'W1', state: 'CREATED' }] };
    return rota.fulfill({ json: corpo, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await entrar(page);
  await page.getByRole('button', { name: 'Conectar o Classroom' }).click();
  await expect(page.locator('.aviso-toast').getByText('Classroom conectado.')).toBeVisible();
  await expect(page).toHaveURL(/\/#\/inicio$/);
  await expect(page.getByText('Fichamento do capítulo 3')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir o Classroom' })).toBeVisible();
  await print(page, '14-classroom', { fullPage: true });
  // Desconectar apaga a autorização e as atividades.
  await page.goto('/#/configuracoes');
  await page.getByText('Desconectar o Classroom').click();
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(page.locator('.aviso-toast').getByText('Classroom desconectado.')).toBeVisible();
  expect(await (await page.request.get('http://localhost:8787/__pedidos')).json()).toContain('POST /google/desconectar');
});
});

/** Puxar para atualizar com o dedo (eventos de toque, como no iPhone). */
async function puxar(page) {
  await page.evaluate(() => {
    const tela = document.querySelector('main.tela');
    // O WebKit do teste não deixa criar Touch: um Event com as mesmas listas basta para o app.
    const toque = (tipo, y) => {
      const e = new Event(tipo, { bubbles: true });
      const lista = [{ identifier: 1, target: tela, clientX: 200, clientY: y }];
      Object.defineProperty(e, 'touches', { value: tipo === 'touchend' ? [] : lista });
      Object.defineProperty(e, 'changedTouches', { value: lista });
      tela.dispatchEvent(e);
    };
    toque('touchstart', 150);
    toque('touchmove', 300);
    toque('touchend', 300);
  });
}

test('atualizar com o eTICKET fora do ar não fica girando para sempre', async ({ page }) => {
  test.setTimeout(90000);
  await workerFalso(page);
  await entrar(page);
  await page.request.get(`${WORKER}/__eticket-mudo`);
  await puxar(page);
  await expect(page.locator('.puxar.girando')).toBeVisible();
  // O app desiste em 25 s, mostra a falha e mantém os dados salvos.
  await expect(page.locator('.puxar.girando')).toHaveCount(0, { timeout: 40000 });
  await expect(page.getByText('Não consegui falar com o eTICKET agora')).toBeVisible();
  await expect(page.getByText('R$ 12,50').first()).toBeVisible();
});

test('Início e RU atualizam sem recriar os cartões (sem piscar)', async ({ page }) => {
  await workerFalso(page);
  await entrar(page);
  const marcar = () => page.evaluate(() => document.querySelectorAll('main.tela .pilha > *').forEach((e) => (e.__marca = true)));
  const mantidos = () => page.evaluate(() => [...document.querySelectorAll('main.tela .pilha > section')].every((e) => e.__marca));
  await marcar();
  await puxar(page);
  await expect(page.locator('.puxar.girando')).toHaveCount(0);
  expect(await mantidos()).toBe(true);

  await page.getByRole('link', { name: 'RU' }).click();
  await expect(page.getByRole('heading', { name: 'RU', exact: true })).toBeVisible();
  await marcar();
  await page.getByRole('radio', { name: /Café/ }).click();
  await expect(page.getByText('Café preto')).toBeVisible();
  expect(await mantidos()).toBe(true);
});

/** Etapa 1 (Portal) do primeiro login; para na etapa do eTICKET. */
async function entrarSoNoPortal(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sou aluno' }).click();
  await page.getByLabel('CPF').fill('00000000000');
  await page.getByLabel('Senha do Portal do Aluno').fill('senha-de-teste');
  await page.getByRole('button', { name: 'Entrar no Portal' }).click();
  await expect(page.getByText('Ainda não tem acesso ao eTICKET?')).toBeVisible();
}

test('entrar sem o eTICKET: aviso em todas as abas e conectar depois', async ({ page }) => {
  const worker = await workerFalso(page);
  await entrarSoNoPortal(page);
  // Senha errada no eTICKET: a faixa de erro oferece seguir só com o Portal.
  await page.getByLabel('Senha do eTICKET').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar no eTICKET' }).click();
  await expect(page.getByText('O eTICKET não aceitou o CPF ou a senha')).toBeVisible();
  await print(page, '30-login-sem-eticket');
  const antes = (await worker.pedidos()).length;
  await page.getByRole('button', { name: 'Continuar só com o Portal', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar sem o eTICKET' }).last().click();
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa' })).toBeVisible();

  // Na Início e no RU, o convite é o próprio cartão do saldo (uma chamada só); em Horários e Relatórios, uma faixa.
  // Em Notas não há convite (não tem relação com o RU).
  const conectarNoCartao = page.locator('main:not([style*="hidden"]) .tingido').getByRole('button', { name: 'Conectar o eTICKET' });
  await expect(conectarNoCartao).toHaveCount(1);
  await expect(page.locator('.faixa.eticket')).toHaveCount(0);
  await expect(page.getByText('Sua sessão do eTICKET terminou')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mostrar QR' })).toHaveCount(0);
  await print(page, '31-inicio-sem-eticket');
  for (const [aba, faixas] of [['Horários', 1], ['Notas', 0], ['Relatórios', 1], ['RU', 0]]) {
    await page.locator('.abas').getByText(aba, { exact: true }).click();
    await expect(page.locator('main[data-tela]').getByRole('heading', { name: aba, exact: true })).toBeVisible();
    await expect(page.locator('main:not([style*="hidden"]) .faixa.eticket')).toHaveCount(faixas);
  }
  await expect(conectarNoCartao).toHaveCount(1);
  // O cardápio vem da página pública, sem login.
  await page.getByRole('radio', { name: /Café/ }).click();
  await expect(page.getByText('Café preto')).toBeVisible();
  await print(page, '32-ru-sem-eticket');
  // Depois de pular, nenhum pedido ao eTICKET além do cardápio público.
  const depois = (await worker.pedidos()).slice(antes);
  expect(depois.some((p) => p.includes('/eticket/menuExterno/'))).toBe(true);
  expect(depois.filter((p) => /^\w+ \/eticket\//.test(p) && !p.includes('/eticket/menuExterno/'))).toEqual([]);

  // Conectar depois, pelo cartão do RU.
  await conectarNoCartao.click();
  await expect(page.getByText('Ainda não tem acesso ao eTICKET?')).toHaveCount(0); // no Conectar não se oferece pular
  await page.getByLabel('CPF').fill('00000000000');
  await page.getByLabel('Senha do eTICKET').fill('senha-eticket');
  await page.getByRole('button', { name: 'Entrar no eTICKET' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar o eTICKET' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mostrar QR' })).toBeVisible();
});

test('sem eTICKET pelo cartão: cancelar mantém a etapa; senha errada no Conectar mantém o aviso; Sair limpa', async ({ page }) => {
  await workerFalso(page);
  await entrarSoNoPortal(page);
  await page.getByRole('button', { name: 'Continuar sem o eTICKET' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByLabel('Senha do eTICKET')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar sem o eTICKET' }).first().click();
  await page.getByRole('button', { name: 'Continuar sem o eTICKET' }).last().click();
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa' })).toBeVisible();

  // Senha errada no Conectar: erro normal (Relatar), e o aviso continua na Início.
  await page.getByRole('button', { name: 'Conectar o eTICKET' }).click();
  await page.getByLabel('CPF').fill('00000000000');
  await page.getByLabel('Senha do eTICKET').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar no eTICKET' }).click();
  await expect(page.getByRole('button', { name: 'Relatar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar só com o Portal', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('button', { name: 'Conectar o eTICKET' })).toHaveCount(1);

  // Sair apaga a escolha: o próximo login completo não mostra o aviso.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Configurações' }).click();
  await expect(page.getByText('Conectar o eTICKET do RU')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Sou aluno' })).toBeVisible();
  await entrar(page);
  await expect(page.getByRole('button', { name: 'Conectar o eTICKET' })).toHaveCount(0);
});

test('Biblioteca: buscar no acervo e ver os exemplares, sem precisar do login do Portal', async ({ page }) => {
  const worker = await workerFalso(page);
  await entrar(page);
  await page.request.get(`${WORKER}/__expirar-portal`); // a pesquisa é pública
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /Biblioteca/ }).click();
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible();
  await expect(page.getByText('Pesquise no acervo')).toBeVisible();
  const antes = (await worker.pedidos()).length;
  await page.getByLabel('Título, autor ou assunto').fill('direito civil');
  await page.getByLabel('Título, autor ou assunto').press('Enter');
  const titulo = page.getByRole('button', { name: /Curso de direito civil de exemplo: parte geral/ });
  await expect(titulo).toBeVisible();
  await expect(page.getByText('2 títulos')).toBeVisible();
  await expect(titulo).toContainText('SOUZA, Maria de Teste. · 2019');
  await expect(titulo).toContainText('Biblioteca Central');
  await print(page, '40-biblioteca-resultado');
  await titulo.click();
  const folha = page.getByRole('dialog');
  await expect(folha.getByText('2 disponíveis · 3 no total')).toBeVisible();
  await expect(folha.getByText('CLA 00001-1').first()).toBeVisible();
  await expect(folha.getByText('Emprestado')).toBeVisible();
  await print(page, '41-biblioteca-exemplares');
  await folha.getByRole('button', { name: 'Fechar' }).click();
  // A mesma busca de novo vem do cache: nenhum pedido novo à Ufac.
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(titulo).toBeVisible();
  const pedidos = (await worker.pedidos()).slice(antes).filter((p) => p.includes('/biblioteca/'));
  expect(pedidos.filter((p) => p.includes('resultado.action'))).toHaveLength(1);
  expect(pedidos.filter((p) => p.includes('itens.action'))).toHaveLength(1);
  // Busca sem resultado: estado vazio em linguagem humana.
  await page.getByLabel('Título, autor ou assunto').fill('nada');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Nada encontrado')).toBeVisible();
});

test('Créditos: quem faz o UFAC+, aberto pelas Configurações', async ({ page }) => {
  await workerFalso(page);
  await entrar(page);
  await page.goto('/#/configuracoes');
  await page.getByRole('button', { name: /Créditos/ }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
  await expect(page.getByText('Arthur Henrique de Souza Cavalcante Ferreira')).toBeVisible();
  await expect(page.getByText('Colaborador · versão iPhone')).toBeVisible();
  await print(page, '42-creditos', { fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await print(page, '43-creditos-escuro', { fullPage: true });
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
});

// O service worker do app deixa os pedidos a outros sites passarem direto, mas no WebKit o Playwright não consegue
// interceptar o que passa por ele: aqui ele fica desligado para o site da Ufac simulado responder.
test.describe('sem service worker', () => {
  test.use({ serviceWorkers: 'block' });
  test('Editais da Proaes e da Prograd: lista pública lida direto do site da Ufac, com cache', async ({ page }) => {
    await workerFalso(page);
    // Site da Ufac simulado com as fixtures públicas (nenhum pedido sai para a Ufac).
    const pedidos = [];
    await page.route('https://www3.ufac.br/**', (rota) => {
      const u = new URL(rota.request().url());
      pedidos.push(u.pathname + u.search);
      expect(rota.request().headers().accept).toBe('application/json');
      const arquivo = u.pathname.startsWith('/prograd/') ? 'prograd_editais.json' : 'proaes_editais.json';
      const corpo = readFileSync(resolve(import.meta.dirname, '../fixtures/public', arquivo), 'utf8');
      return rota.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: corpo });
    });
    await entrar(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('link', { name: /Mapa do campus/ })).toHaveAttribute('href', 'https://sistemas.ufac.br/mapa/');
    await page.getByRole('button', { name: /Editais/ }).click();
    await expect(page.getByRole('heading', { name: 'Editais' })).toBeVisible();
    const edital = page.getByRole('link', { name: /Edital Proaes nº 22\/2026 - Programa Pulsar Acolhe/ });
    await expect(edital).toBeVisible();
    await expect(edital).toHaveAttribute('href', 'https://www3.ufac.br/proaes/2026/edital-proaes-no-22-2026-programa-pulsar-acolhe');
    await expect(edital).toHaveAttribute('target', '_blank');
    await expect(edital).toContainText('Publicado em 6 de novembro · atualizado em 16 de novembro');
    await expect(page.getByText('6 editais de 2026')).toBeVisible();
    await print(page, '44-editais-proaes');
    await page.getByRole('radio', { name: 'Prograd' }).click();
    await expect(page.getByRole('link', { name: /Edital Prograd nº 47\/2026/ })).toBeVisible();
    await expect(page.getByText('4 editais de 2026')).toBeVisible();
    // Voltar à Proaes e reabrir a tela vem do cache: um pedido só por pró-reitoria.
    await page.getByRole('radio', { name: 'Proaes' }).click();
    await expect(edital).toBeVisible();
    await page.getByRole('button', { name: 'Voltar' }).click();
    await page.getByRole('button', { name: /Editais/ }).click();
    await expect(edital).toBeVisible();
    expect(pedidos.filter((p) => p.startsWith('/proaes/@search'))).toHaveLength(1);
    expect(pedidos.filter((p) => p.startsWith('/prograd/@search'))).toHaveLength(1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await print(page, '45-editais-escuro');
  });
});
