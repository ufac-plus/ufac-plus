// Componentes reutilizáveis. O HTML é montado com `html` (escapa tudo por padrão).
import { icone } from './icones.js';

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPE[c]);

/** Marca um trecho como HTML já seguro (para compor componentes). */
export const cru = (s) => ({ __cru: String(s) });

/** Template que escapa os valores interpolados, menos os marcados com cru() e listas de cru(). */
export function html(partes, ...valores) {
  let s = partes[0];
  valores.forEach((v, i) => {
    if (Array.isArray(v)) s += v.map((x) => (x?.__cru !== undefined ? x.__cru : esc(x))).join('');
    else s += v?.__cru !== undefined ? v.__cru : v === false || v == null ? '' : esc(v);
    s += partes[i + 1];
  });
  return cru(s);
}

export const ic = (nome, rotulo) => cru(icone(nome, rotulo));

export function montar(alvo, conteudo) {
  alvo.innerHTML = conteudo.__cru ?? conteudo;
  return alvo;
}

/**
 * Como montar(), mas mexe só no que mudou. Trocar tudo com innerHTML recria os cartões de vidro (o iOS refaz o
 * desfoque), recarrega a foto e reinicia a animação de entrada: é isso que fazia a Início e o RU piscarem ao
 * abrir, quando os dados salvos eram desenhados e logo em seguida os novos. Use só em telas cujos botões
 * funcionam por data-acao (os elementos mantidos não ganham ouvintes de novo).
 */
export function remontar(alvo, conteudo) {
  if (!alvo.firstChild) return montar(alvo, conteudo);
  const modelo = document.createElement('template');
  modelo.innerHTML = conteudo.__cru ?? conteudo;
  morfarFilhos(alvo, modelo.content);
  return alvo;
}

const chave = (n) => (n.nodeType === 1 ? `${n.nodeName}|${n.getAttribute('aria-label') ?? ''}|${n.className}` : `#${n.nodeType}`);
const parecidos = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

function morfarFilhos(pai, novoPai) {
  let atual = pai.firstChild;
  for (const novo of [...novoPai.childNodes]) {
    if (atual && !parecidos(atual, novo)) {
      // Procura adiante um irmão igual (ex.: uma faixa de aviso que sumiu antes deste cartão).
      let adiante = atual.nextSibling;
      while (adiante && chave(adiante) !== chave(novo)) adiante = adiante.nextSibling;
      if (adiante) {
        while (atual !== adiante) {
          const prox = atual.nextSibling;
          atual.remove();
          atual = prox;
        }
      }
    }
    if (atual && parecidos(atual, novo)) {
      if (novo.nodeType === 1) morfar(atual, novo);
      else if (atual.nodeValue !== novo.nodeValue) atual.nodeValue = novo.nodeValue;
      atual = atual.nextSibling;
    } else {
      pai.insertBefore(novo, atual);
    }
  }
  while (atual) {
    const prox = atual.nextSibling;
    atual.remove();
    atual = prox;
  }
}

function morfar(velho, novo) {
  for (const { name } of [...velho.attributes]) if (!novo.hasAttribute(name)) velho.removeAttribute(name);
  for (const { name, value } of novo.attributes) if (velho.getAttribute(name) !== value) velho.setAttribute(name, value);
  morfarFilhos(velho, novo);
}


export const cabecalho = ({ sobre, titulo, sub, acoes = '' }) => html`
  <header class="cabecalho">
    <div class="cresce">
      ${sobre ? html`<div class="sobre">${sobre}</div>` : ''}
      <h1 tabindex="-1">${titulo}</h1>
      ${sub ? html`<div class="sub">${sub}</div>` : ''}
    </div>
    ${acoes ? html`<div class="acoes">${acoes}</div>` : ''}
  </header>`;

export const botaoRedondo = (nome, rotulo, acao) =>
  html`<button class="botao-redondo vidro tocavel" data-acao="${acao}" aria-label="${rotulo}">${ic(nome)}</button>`;

export const vazio = (nome, titulo, texto = '') => html`
  <div class="vazio">${ic(nome)}<div class="titulo">${titulo}</div>${texto ? html`<div>${texto}</div>` : ''}</div>`;

export const esqueleto = (linhas = 3) => html`
  <div class="pilha" style="gap:10px" aria-busy="true" aria-label="Carregando">
    ${Array.from({ length: linhas }, (_, i) => cru(`<div class="esqueleto" style="height:${i === 0 ? 20 : 14}px;width:${[60, 90, 75, 40][i % 4]}%"></div>`))}
  </div>`;

/** Rodapé de texto centralizado, embaixo dos cartões. */
export const notaRodape = (texto) => html`<div class="nota-rodape">${texto}</div>`;

/** Título de seção dentro de um cartão em lista (Configurações). */
export const cabecalhoSecao = (titulo, sub = '') =>
  html`<div class="cabecalho-secao"><h2>${titulo}</h2>${sub ? html`<div class="apoio">${sub}</div>` : ''}</div>`;

/**
 * Faixa de aviso. As ações ficam embaixo do texto, em pílulas de 44 px (nunca espremem o texto numa coluna).
 * acao2: uma segunda ação, discreta (ex.: "Relatar" ao lado de "Tentar de novo").
 */
export const faixa = ({ icone: nome = 'info', titulo, texto = '', tipo = '', acao = '', rotuloAcao = '', acao2 = '', rotuloAcao2 = '', compacta = false }) => html`
  <div class="faixa ${tipo} ${compacta ? 'compacta' : ''}" role="status">
    ${ic(nome)}
    <div class="cresce">
      <div class="titulo">${titulo}</div>${texto ? html`<div>${texto}</div>` : ''}
      ${acao || acao2
        ? html`<div class="acoes-faixa">${acao ? html`<button class="acao" data-acao="${acao}">${rotuloAcao}</button>` : ''}${acao2 ? html`<button class="acao secundaria" data-acao="${acao2}">${rotuloAcao2}</button>` : ''}</div>`
        : ''}
    </div>
  </div>`;

/** Aviso de link que sai do app, só para o leitor de tela. */
export const abreFora = cru('<span class="oculto-leitor"> (abre no Safari)</span>');

export const item = ({ icone: nome, titulo, sub = '', acao = '', href = '', tipoIcone = '', direita = '', extra = null }) => {
  const dentro = html`
    ${nome ? html`<span class="icone ${tipoIcone}">${ic(nome)}</span>` : ''}
    <span class="cresce"><span class="titulo">${titulo}</span>${sub ? html`<span class="apoio sub">${sub}</span>` : ''}${extra?.rotulo ? html`<span class="selo verde selo-horas">${ic('horarios')}<span>${extra.rotulo}</span></span>` : ''}</span>
    ${direita || (acao || href ? html`<span class="seta">${ic(href ? 'abrir' : 'seta')}</span>` : '')}`;
  const fora = href && !href.startsWith('/');
  if (href) return html`<a class="item tocavel" href="${href}" ${fora ? html`target="_blank" rel="noopener"` : ''}>${dentro}${fora ? abreFora : ''}</a>`;
  if (acao) return html`<button class="item tocavel" data-acao="${acao}">${dentro}</button>`;
  return html`<div class="item">${dentro}</div>`;
};

/**
 * Controle segmentado (escolha única): radiogroup, com a hora (sub) no nome lido pelo leitor de tela.
 */
export function segmentos(opcoes, ativo, acao, rotulo = '') {
  const i = Math.max(0, opcoes.findIndex((o) => o.id === ativo));
  return html`
    <div class="segmentos" role="radiogroup" ${rotulo ? html`aria-label="${rotulo}"` : ''} style="--n:${opcoes.length};--i:${i}">
      <span class="polegar"></span>
      ${opcoes.map((o) => html`<button role="radio" aria-checked="${o.id === ativo}" aria-label="${o.sub ? `${o.nome}, ${o.sub}` : o.nome}" data-acao="${acao}" data-valor="${o.id}">${o.nome}${o.sub ? html`<small aria-hidden="true">${o.sub}</small>` : ''}</button>`)}
    </div>`;
}

/** Marca na hora a opção tocada (o polegar desliza já, antes de redesenhar). */
export function marcarSegmento(el) {
  const grupo = el.closest('.segmentos');
  if (!grupo) return;
  const botoes = [...grupo.querySelectorAll('[role=radio]')];
  grupo.style.setProperty('--i', botoes.indexOf(el));
  botoes.forEach((b) => b.setAttribute('aria-checked', String(b === el)));
}

// ---------- Vibração ----------

/**
 * Toque leve. O Safari não tem navigator.vibrate; no iOS 18+, alternar um interruptor nativo (<input switch>)
 * dentro de um toque faz o iPhone dar o "clique" do sistema. Em outros navegadores não faz nada.
 */
let interruptorHaptico;
export function vibrarLeve() {
  if (navigator.vibrate) {
    navigator.vibrate(10);
    return;
  }
  if (!interruptorHaptico) {
    interruptorHaptico = document.createElement('label');
    interruptorHaptico.setAttribute('aria-hidden', 'true');
    interruptorHaptico.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0;pointer-events:none';
    const entrada = document.createElement('input');
    entrada.type = 'checkbox';
    entrada.setAttribute('switch', '');
    entrada.tabIndex = -1;
    interruptorHaptico.append(entrada);
    document.body.append(interruptorHaptico);
  }
  interruptorHaptico.click();
}

// ---------- Folha (sheet) e aviso ----------

let contadorFolha = 0;

/**
 * Folha modal. Acessível: o resto do app fica inerte, o foco entra na folha (no título) e volta para onde
 * estava ao fechar; Esc fecha.
 */
export function abrirFolha(conteudo, { aoFechar } = {}) {
  const veu = document.createElement('div');
  veu.className = 'veu';
  const folha = document.createElement('div');
  folha.className = 'folha vidro forte';
  folha.setAttribute('role', 'dialog');
  folha.setAttribute('aria-modal', 'true');
  montar(folha, html`<div class="alca" aria-hidden="true"></div>${conteudo}`);
  const titulo = folha.querySelector('h1, h2');
  if (titulo) {
    titulo.id ||= `folha-titulo-${++contadorFolha}`;
    titulo.tabIndex = -1;
    folha.setAttribute('aria-labelledby', titulo.id);
  }
  const antes = document.activeElement;
  const fundo = [...document.body.children];
  fundo.forEach((el) => (el.inert = true));
  document.body.append(veu, folha);
  requestAnimationFrame(() => {
    veu.classList.add('aberto');
    folha.classList.add('aberta');
    (titulo ?? folha.querySelector('button'))?.focus({ preventScroll: true });
  });
  let fechada = false;
  const fechar = () => {
    if (fechada) return;
    fechada = true;
    document.removeEventListener('keydown', aoTeclar);
    fundo.forEach((el) => (el.inert = false));
    veu.classList.remove('aberto');
    folha.classList.remove('aberta');
    setTimeout(() => {
      veu.remove();
      folha.remove();
    }, 420);
    if (antes?.isConnected) antes.focus({ preventScroll: true });
    aoFechar?.();
  };
  const aoTeclar = (e) => e.key === 'Escape' && fechar();
  document.addEventListener('keydown', aoTeclar);
  veu.addEventListener('click', fechar);
  // Arrastar a folha para baixo fecha.
  let inicioY = null;
  folha.addEventListener('touchstart', (e) => (inicioY = folha.scrollTop === 0 ? e.touches[0].clientY : null), { passive: true });
  folha.addEventListener('touchmove', (e) => {
    if (inicioY === null) return;
    const d = Math.max(0, e.touches[0].clientY - inicioY);
    folha.style.transition = 'none';
    folha.style.transform = `translateY(${d}px)`;
  }, { passive: true });
  folha.addEventListener('touchend', (e) => {
    if (inicioY === null) return;
    const d = e.changedTouches[0].clientY - inicioY;
    folha.style.transition = '';
    folha.style.transform = '';
    inicioY = null;
    if (d > 110) fechar();
  });
  return { folha, fechar };
}

/** Pergunta de confirmação em folha. Resolve true/false. */
export function confirmar({ titulo, texto, sim, perigo = false }) {
  return new Promise((resolve) => {
    let respondido = false;
    const { folha, fechar } = abrirFolha(
      html`<div class="pilha" style="padding:6px 2px 4px">
        <h2>${titulo}</h2>
        <div class="texto-folha">${texto}</div>
        <button class="botao largo ${perigo ? 'perigo' : ''}" data-r="sim">${sim}</button>
        <button class="botao largo claro" data-r="nao">Cancelar</button>
      </div>`,
      { aoFechar: () => !respondido && resolve(false) },
    );
    folha.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      respondido = true;
      resolve(r === 'sim');
      fechar();
    });
  });
}

/** Anúncio para o leitor de tela: uma região viva fixa (uma que nasce já preenchida o VoiceOver ignora). */
export function anunciar(texto) {
  let regiao = document.getElementById('anuncio');
  if (!regiao) {
    regiao = document.createElement('div');
    regiao.id = 'anuncio';
    regiao.className = 'oculto-leitor';
    regiao.setAttribute('aria-live', 'polite');
    document.body.append(regiao);
  }
  regiao.textContent = '';
  setTimeout(() => (regiao.textContent = texto), 60);
}

let toastAtual;
/** Aviso curto no topo, em cápsula. ok: mostra o ícone de confirmado. */
export function avisar(texto, { ok = false } = {}) {
  toastAtual?.remove();
  const t = document.createElement('div');
  t.className = 'aviso-toast';
  t.setAttribute('aria-hidden', 'true');
  montar(t, html`${ok ? ic('check') : ''}<span>${texto}</span>`);
  document.body.append(t);
  toastAtual = t;
  anunciar(texto);
  requestAnimationFrame(() => t.classList.add('visivel'));
  setTimeout(() => {
    t.classList.remove('visivel');
    setTimeout(() => t.remove(), 450);
  }, 3200);
}

// ---------- Puxar para atualizar e barra compacta ----------

const LIMIAR = 80;

export function puxarParaAtualizar(tela, aoAtualizar) {
  const indicador = document.createElement('div');
  indicador.className = 'puxar';
  indicador.setAttribute('aria-hidden', 'true');
  indicador.innerHTML = `<div class="roda vidro forte">${icone('atualizar')}</div>`;
  tela.prepend(indicador);
  let inicio = null;
  let distancia = 0;
  let ocupado = false;
  let pronto = false;
  tela.addEventListener('touchstart', (e) => {
    inicio = tela.scrollTop <= 0 && !ocupado ? e.touches[0].clientY : null;
    pronto = false;
  }, { passive: true });
  tela.addEventListener('touchmove', (e) => {
    if (inicio === null) return;
    distancia = Math.max(0, e.touches[0].clientY - inicio);
    const p = Math.min(1, distancia / LIMIAR);
    // Passou do limiar: a roda cresce e muda de cor, e o iPhone dá um toque. Soltar agora atualiza.
    if ((distancia > LIMIAR) !== pronto) {
      pronto = distancia > LIMIAR;
      indicador.classList.toggle('pronto', pronto);
      if (pronto) vibrarLeve();
    }
    indicador.style.opacity = p;
    indicador.style.transform = `translateY(${Math.min(distancia, 90) * 0.5}px)`;
    indicador.querySelector('svg').style.transform = `rotate(${p * 270}deg)`;
  }, { passive: true });
  tela.addEventListener('touchend', async () => {
    if (inicio === null) return;
    inicio = null;
    indicador.classList.remove('pronto');
    if (distancia > LIMIAR) {
      ocupado = true;
      indicador.classList.add('girando');
      indicador.style.transform = 'translateY(40px)';
      indicador.querySelector('svg').style.transform = '';
      anunciar('Atualizando');
      try {
        // Rede pendurada não pode deixar a roda girando para sempre (cada pedido já tem limite próprio).
        await Promise.race([aoAtualizar(), new Promise((ok) => setTimeout(ok, 60000))]);
      } catch {
        /* a tela mostra a falha na faixa */
      } finally {
        ocupado = false;
        indicador.classList.remove('girando');
      }
      // Pronto: um ✓ rápido antes de sumir.
      indicador.classList.add('feito');
      indicador.querySelector('.roda').innerHTML = icone('check');
      await new Promise((ok) => setTimeout(ok, 450));
      indicador.classList.remove('feito');
      indicador.querySelector('.roda').innerHTML = icone('atualizar');
    }
    distancia = 0;
    indicador.style.transition = 'opacity 250ms, transform 300ms';
    indicador.style.opacity = 0;
    indicador.style.transform = '';
    setTimeout(() => (indicador.style.transition = ''), 320);
  });
}

export function barraCompacta(tela, titulo) {
  const barra = document.createElement('div');
  barra.className = 'barra-topo vidro forte';
  barra.setAttribute('aria-hidden', 'true');
  barra.textContent = titulo;
  tela.append(barra);
  tela.addEventListener('scroll', () => barra.classList.toggle('visivel', tela.scrollTop > 56), { passive: true });
}
