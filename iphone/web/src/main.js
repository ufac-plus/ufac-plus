import './css/tokens.css';
import './css/vidro.css';
import './css/app.css';
import { aoMudarSessao } from './lib/api.js';
import { ler } from './lib/armazenamento.js';
import { atualizarSelo, lerPrefs, sincronizarAgenda } from './lib/push.js';
import { loginConcluido } from './lib/sessao.js';
import { avisar, html, ic, montar } from './ui/componentes.js';
import { concluirRetornoDoGoogle } from './lib/classroom.js';
import { registrar } from './lib/registro.js';
import { URL_PORTAL_ALUNO, URL_PORTAL_PROFESSOR } from './lib/config.js';

const ABAS = {
  aluno: [
    ['inicio', 'Início', 'inicio'],
    ['horarios', 'Horários', 'horarios'],
    ['notas', 'Notas', 'notas'],
    ['relatorios', 'Relatórios', 'relatorios'],
    ['ru', 'RU', 'ru'],
  ],
  professor: [
    ['inicio', 'Início', 'inicio'],
    ['turmas', 'Turmas', 'grupo'],
    ['horarios', 'Horários', 'horarios'],
  ],
};

const TELAS = {
  'boas-vindas': () => import('./telas/boasVindas.js'),
  login: () => import('./telas/login.js'),
  inicio: async () => ((await ler('perfil')) === 'professor' ? import('./telas/professor.js').then((m) => m.inicio) : import('./telas/inicio.js')),
  horarios: () => import('./telas/horarios.js'),
  notas: () => import('./telas/notas.js'),
  relatorios: () => import('./telas/relatorios.js'),
  ru: () => import('./telas/ru.js'),
  turmas: () => import('./telas/professor.js').then((m) => m.turmas),
  turma: () => import('./telas/professor.js').then((m) => m.turma),
  menu: () => import('./telas/menu.js'),
  configuracoes: () => import('./telas/configuracoes.js'),
  historico: () => import('./telas/historico.js'),
  biblioteca: () => import('./telas/biblioteca.js'),
  relatar: () => import('./telas/relatar.js'),
  creditos: () => import('./telas/creditos.js'),
};

const app = document.getElementById('app');
let ultimaAtualizacao = 0;
let telaAtual = null;

export async function aplicarAparencia() {
  const prefs = await lerPrefs();
  const perfil = (await ler('perfil')) ?? 'aluno';
  const raiz = document.documentElement;
  raiz.dataset.perfil = perfil;
  // O tema fica sempre resolvido (também em "Sistema"): o CSS do escuro existe uma vez só, em [data-tema='escuro'].
  const escuro = prefs.tema === 'escuro' || (prefs.tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  raiz.dataset.tema = escuro ? 'escuro' : 'claro';
  const fundo = getComputedStyle(raiz).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fundo || (escuro ? '#000000' : '#f3f5f9'));
}

function rotaAtual() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  return { nome: nome || 'inicio', parametro: resto.join('/') };
}

export function ir(rota, { substituir = false } = {}) {
  const alvo = `#/${rota}`;
  if (location.hash === alvo) return renderizar();
  if (substituir) history.replaceState(null, '', alvo);
  else history.pushState(null, '', alvo);
  renderizar(); // pushState não dispara hashchange
}

export const voltar = () => (history.length > 1 ? history.back() : ir('inicio'));

// Profundidade de cada tela fora das abas: maior = mais "para dentro". Define a direção da transição.
const NIVEL = { menu: 1, historico: 1, biblioteca: 1, turma: 1, configuracoes: 2, relatar: 3, creditos: 3 };
const MODAIS = new Set(['menu']); // sobem de baixo (têm X); as outras entram da direita (têm ‹)
const nivelDe = (nome) => NIVEL[nome] ?? 0;
const rolagemPorAba = new Map(); // a aba guarda onde estava ao voltar para ela

function marcarAba(barra, nome) {
  const abas = [...barra.querySelectorAll('.aba')];
  const i = abas.findIndex((a) => a.dataset.aba === nome);
  if (i >= 0) barra.style.setProperty('--i', i);
  abas.forEach((a) => (a.dataset.aba === nome ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

async function barraDeAbas(perfil, nome) {
  const abas = ABAS[perfil];
  const i = abas.findIndex(([id]) => id === nome);
  let barra = document.querySelector('.abas');
  if (i < 0) {
    barra?.remove();
    document.querySelector('.borda-rolagem')?.remove();
    return;
  }
  if (!barra || barra.dataset.perfil !== perfil) {
    barra?.remove();
    barra = document.createElement('nav');
    barra.className = 'abas vidro forte';
    barra.dataset.perfil = perfil;
    barra.setAttribute('aria-label', 'Seções');
    barra.style.setProperty('--n', abas.length);
    montar(barra, html`<span class="lente" aria-hidden="true"></span>${abas.map(([id, rotulo, icone]) => html`<a class="aba tocavel" href="#/${id}" data-aba="${id}">${ic(icone)}<span>${rotulo}</span></a>`)}`);
    // A aba responde no próprio toque (a tela nova chega logo depois). Tocar na aba atual sobe ao topo, como no iOS.
    barra.addEventListener('click', (e) => {
      const aba = e.target.closest('.aba');
      if (!aba) return;
      if (aba.getAttribute('aria-current') === 'page') {
        e.preventDefault();
        telaAtual?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      marcarAba(barra, aba.dataset.aba);
    });
    if (!document.querySelector('.borda-rolagem')) {
      const borda = document.createElement('div');
      borda.className = 'borda-rolagem';
      borda.setAttribute('aria-hidden', 'true');
      document.body.append(borda);
    }
    document.body.append(barra);
  }
  marcarAba(barra, nome);
}

let geracao = 0;
let primeiraTela = true;

/** Fim de uma animação de CSS, com prazo (movimento reduzido não anima). */
const fimDaAnimacao = (el, ms) => new Promise((ok) => {
  const pronto = () => (clearTimeout(prazo), ok());
  const prazo = setTimeout(pronto, ms);
  el.addEventListener('animationend', pronto, { once: true });
});

async function renderizar() {
  const minha = ++geracao;
  let { nome, parametro } = rotaAtual();
  const logado = await loginConcluido();
  const perfil = (await ler('perfil')) ?? 'aluno';
  if (!logado && nome !== 'login' && nome !== 'relatar') nome = 'boas-vindas';
  if (logado && (nome === 'boas-vindas' || !TELAS[nome])) nome = 'inicio';
  if (perfil === 'professor' && ['notas', 'relatorios', 'ru'].includes(nome)) nome = 'inicio';
  await aplicarAparencia();

  const modulo = await TELAS[nome]();
  if (minha !== geracao) return; // outra navegação começou enquanto esta carregava
  const tela = document.createElement('main');
  tela.className = 'tela';
  tela.dataset.tela = nome;
  const comAbas = ABAS[perfil].some(([id]) => id === nome) && logado;
  if (!comAbas) tela.classList.add('sem-abas');

  const ctx = { ir, voltar, parametro, perfil, renderizar };
  // Cada tela liga os próprios botões por data-acao.
  const acoes = {};
  // Valem em qualquer tela (faixas de erro, login), a menos que a tela tenha a sua.
  const globais = {
    relatar: () => ir(`relatar/${encodeURIComponent(nome)}`),
    // Aviso "Conecte o eTICKET" (quem entrou só com o Portal): mesma etapa do login, sozinha.
    'conectar-eticket': () => ir('login/eticket'),
    // A troca de senha é no site oficial, no Safari: o app nunca recebe a senha nova antes do login.
    'trocar-senha-portal': () => window.open(perfil === 'professor' ? URL_PORTAL_PROFESSOR : URL_PORTAL_ALUNO, '_blank', 'noopener'),
    // "Tentar de novo" das faixas de falha: a tela atualiza no lugar (cada tela que lê dados ouve "atualizar").
    'tentar-de-novo': () => tela.dispatchEvent(new CustomEvent('atualizar', { detail: { forcar: true } })),
  };
  tela.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao]');
    // "relatar" funciona em qualquer tela (faixas de erro, login): abre o relato dizendo de onde veio.
    const acao = alvo && (acoes[alvo.dataset.acao] ?? globais[alvo.dataset.acao]);
    if (acao) {
      e.preventDefault();
      acao(alvo, e);
    }
  });
  ctx.acoes = acoes;

  // Sem piscar: a tela nova monta escondida, por baixo da antiga, e só troca quando já tem conteúdo
  // (o primeiro cartão ou cabeçalho), ou depois de 300 ms.
  tela.style.visibility = 'hidden';
  app.append(tela);
  const temConteudo = () => !!tela.querySelector('.cabecalho, .cartao, form, h1');
  const pronta = new Promise((ok) => {
    if (temConteudo()) return ok();
    const olhar = new MutationObserver(() => temConteudo() && (olhar.disconnect(), ok()));
    olhar.observe(tela, { childList: true, subtree: true });
    setTimeout(() => (olhar.disconnect(), ok()), 300);
  });
  const execucao = Promise.resolve((modulo.default ?? modulo)(tela, ctx));
  await pronta;
  if (minha !== geracao) {
    tela.remove(); // outra navegação já assumiu
    return;
  }

  // A cascata de entrada (.entra) vale só para a abertura do app. Entre abas a troca é instantânea, como no iOS;
  // telas empilhadas deslizam (da direita, ou de baixo no Menu) e voltam pelo mesmo caminho.
  const velha = telaAtual;
  const nomeVelho = velha?.dataset.tela;
  if (!primeiraTela) tela.querySelectorAll('.entra').forEach((e) => e.classList.remove('entra'));
  if (velha && ABAS[perfil].some(([id]) => id === nomeVelho)) rolagemPorAba.set(nomeVelho, velha.scrollTop);
  const indo = nivelDe(nome) > nivelDe(nomeVelho);
  const vindo = nivelDe(nome) < nivelDe(nomeVelho);
  tela.style.visibility = '';
  telaAtual = tela;
  barraDeAbas(perfil, comAbas ? nome : '');
  document.title = `${tela.querySelector('h1')?.textContent.trim() || 'UFAC+'} · UFAC+`;
  if (comAbas && rolagemPorAba.has(nome)) tela.scrollTop = rolagemPorAba.get(nome);

  if (velha && indo) {
    tela.classList.add(MODAIS.has(nome) ? 'anim-modal' : 'anim-empurra');
    velha.classList.add('anim-recua');
    fimDaAnimacao(tela, 420).then(() => {
      velha.remove();
      tela.classList.remove('anim-modal', 'anim-empurra');
    });
  } else if (velha && vindo) {
    app.insertBefore(tela, velha); // a de baixo já está no lugar; a de cima sai
    velha.classList.remove('anim-recua');
    velha.classList.add(MODAIS.has(nomeVelho) ? 'anim-sai-modal' : 'anim-sai-empurra');
    fimDaAnimacao(velha, 380).then(() => velha.remove());
  } else {
    velha?.remove();
  }
  // Leitor de tela: o foco vai para o título da tela nova (sem isso fica perdido na tela que saiu).
  if (!primeiraTela && !tela.contains(document.activeElement)) tela.querySelector('h1')?.focus({ preventScroll: true });
  primeiraTela = false;
  ligarGestoDeVoltar(tela, nome);
  await execucao;
  if (comAbas && rolagemPorAba.has(nome) && tela.scrollTop === 0) tela.scrollTop = rolagemPorAba.get(nome);
  ultimaAtualizacao = Date.now();
}

/**
 * Deslizar da borda esquerda volta, nas telas empilhadas (o app instalado não tem o gesto do Safari).
 * A tela acompanha o dedo; soltando depois de 35% da largura, volta.
 */
function ligarGestoDeVoltar(tela, nome) {
  if (!nivelDe(nome) || MODAIS.has(nome)) return;
  let x0 = null;
  let dx = 0;
  tela.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    x0 = t.clientX < 24 ? t.clientX : null;
    dx = 0;
  }, { passive: true });
  tela.addEventListener('touchmove', (e) => {
    if (x0 === null) return;
    dx = Math.max(0, e.touches[0].clientX - x0);
    tela.style.transition = 'none';
    tela.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  tela.addEventListener('touchend', () => {
    if (x0 === null) return;
    x0 = null;
    if (dx > tela.clientWidth * 0.35) {
      voltar(); // a saída anima a partir de onde o dedo deixou a tela
      return;
    }
    tela.style.transition = 'transform 260ms var(--empurra)';
    tela.style.transform = '';
    setTimeout(() => (tela.style.transition = ''), 280);
  });
}

// Erros do próprio app vão para o registro do "Relatar um problema" (só a mensagem e onde, anonimizadas).
const ondeNoCodigo = (pilha) => String(pilha ?? '').split('\n').slice(0, 3).map((l) => l.replace(/https?:\/\/[^/]+/g, '').trim()).join(' < ');
window.addEventListener('error', (e) => registrar('app', { erro: e.message, onde: ondeNoCodigo(e.error?.stack) || `${e.filename?.replace(/https?:\/\/[^/]+/, '')}:${e.lineno}`, tela: rotaAtual().nome }));
window.addEventListener('unhandledrejection', (e) => registrar('app', { erro: e.reason?.message ?? String(e.reason), onde: ondeNoCodigo(e.reason?.stack), tela: rotaAtual().nome }));

// Ao voltar para o app: atualiza no máximo a cada 15 minutos (regra de respeito à Ufac).
// Atualiza só os dados da tela atual, sem recriá-la (a rolagem e o que estava aberto continuam).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || Date.now() - ultimaAtualizacao <= 15 * 60 * 1000) return;
  ultimaAtualizacao = Date.now();
  telaAtual?.dispatchEvent(new CustomEvent('atualizar', { detail: { forcar: false } }));
});
// Toque nas abas (<a href="#/...">) e o voltar do iPhone mudam o hash.
window.addEventListener('hashchange', renderizar);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarAparencia);
aoMudarSessao(() => telaAtual?.dispatchEvent(new CustomEvent('sessao')));

/**
 * iOS 26: no app instalado, a área do app termina acima do fim da tela (medido no iPhone 15 Pro Max: tela 932,
 * área 873; faltam os 59 pt da Dynamic Island). Bug do WebKit: não dá para desenhar ali. Mede a diferença e passa
 * para o CSS (--falta), que deixa de reservar a barrinha de início (--inset-baixo em app.css).
 */
function medirFalta() {
  // navigator.standalone só existe no iOS: no Android e no computador a diferença é das barras do sistema.
  const instalado = navigator.standalone === true;
  const digitando = document.activeElement?.matches?.('input, textarea, select');
  if (digitando) return;
  const retrato = matchMedia('(orientation: portrait)').matches;
  const alturaTela = retrato ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const larguraTela = retrato ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  const telaInteira = Math.abs(window.innerWidth - larguraTela) < 2; // iPad em janela (Stage Manager) não conta
  const falta = instalado && telaInteira ? alturaTela - window.innerHeight : 0;
  document.documentElement.style.setProperty('--falta', `${falta > 0 && falta <= 140 ? falta : 0}px`);
}
medirFalta();
// O iOS ajusta a área do app logo depois de abrir: mede de novo quando assenta.
setTimeout(medirFalta, 600);
setTimeout(medirFalta, 2000);
const remedir = () => setTimeout(medirFalta, 150);
window.addEventListener('resize', remedir);
window.visualViewport?.addEventListener('resize', remedir);
window.addEventListener('pageshow', remedir);
document.addEventListener('focusout', () => setTimeout(medirFalta, 400)); // teclado fechou
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && remedir());

async function iniciar() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // O iPhone deixa o app aberto em segundo plano por dias: confere versão nova ao voltar para ele.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    }).catch(() => {});
    // Versão nova ativada: recarrega para usá-la já (menos no meio do login, para não perder o que foi digitado).
    let tinhaVersao = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (tinhaVersao && !location.hash.startsWith('#/login')) location.reload();
      tinhaVersao = true;
    });
  }
  // Volta do Google (Classroom): termina a conexão antes de desenhar a Início.
  const retorno = await concluirRetornoDoGoogle().catch((e) => ({ erro: e }));
  await renderizar();
  if (retorno?.erro) avisar(retorno.erro.message);
  else if (retorno?.ok) avisar('Classroom conectado.', { ok: true });
  if (await loginConcluido()) {
    sincronizarAgenda().catch(() => {});
    atualizarSelo().catch(() => {});
  }
}

iniciar();
