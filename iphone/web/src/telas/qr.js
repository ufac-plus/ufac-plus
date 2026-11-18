// QR do RU: gerado aqui mesmo, a partir do número salvo. Funciona offline.
import qrcode from 'qrcode-generator';
import { ler } from '../lib/armazenamento.js';
import { formatarMoeda, mascararNumero } from '../lib/dominio/formatos.js';
import { html, ic, montar, cru, vibrarLeve } from '../ui/componentes.js';
import { soletrar } from './comum.js';

export function svgDoQr(numero) {
  const qr = qrcode(0, 'M');
  qr.addData(numero);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

/**
 * Tela do QR. O QR aparece já no primeiro quadro (a tela inteira sobe de baixo, sem cascata): é a tela usada
 * na fila da catraca. Acessível: o resto do app fica inerte, o foco vai para "Fechar" e volta ao botão de origem.
 */
export async function abrirQr() {
  const ru = await ler('ru');
  const antes = document.activeElement;
  const tela = document.createElement('div');
  tela.className = 'qr-tela';
  tela.setAttribute('role', 'dialog');
  tela.setAttribute('aria-modal', 'true');
  tela.setAttribute('aria-labelledby', 'titulo-qr');
  let mostrar = false;
  let trava;
  const final = ru?.numeroQr ? ru.numeroQr.slice(-4) : '';

  const desenhar = () =>
    montar(tela, html`
      <div class="linha topo-qr">
        <span class="selo">${ic('info')} Aumente o brilho</span>
        <button class="botao-redondo vidro tocavel" data-q="fechar" aria-label="Fechar">${ic('fechar')}</button>
      </div>
      <h1 id="titulo-qr">QR do RU</h1>
      <div class="apoio" style="margin-bottom:18px">Aponte para o leitor na entrada</div>
      ${ru?.numeroQr
        ? html`<div class="qr-cartao" role="img" aria-label="QR de entrada do RU, número terminado em ${soletrar(final)}">
            <div aria-hidden="true">${cru(svgDoQr(ru.numeroQr))}</div>
            <div class="numero" aria-hidden="true">${mostrar ? ru.numeroQr : mascararNumero(ru.numeroQr)}</div>
          </div>
          <div class="oculto-leitor" aria-live="polite">${mostrar ? `Número: ${soletrar(ru.numeroQr)}` : ''}</div>`
        : html`<div class="cartao vazio"><div class="titulo">Ainda não li seu QR</div><div>Abra a aba RU com internet uma vez para salvar o QR neste iPhone.</div></div>`}
      <div class="linha" style="margin-top:18px;flex-wrap:wrap;justify-content:center">
        ${ru ? html`<span class="selo neutro">${ic('dinheiro')} Saldo ${formatarMoeda(ru.saldo)}</span>` : ''}
        <span class="selo verde">${ic('check')} Funciona offline</span>
      </div>
      ${ru?.numeroQr ? html`<button class="botao claro tocavel" style="margin-top:16px" data-q="mostrar" aria-pressed="${mostrar}">${ic('olho')} ${mostrar ? 'Esconder número' : 'Mostrar número'}</button>` : ''}
      <div class="nota-rodape aviso-qr">Não compartilhe prints desta tela: o número vale como dinheiro.</div>`);

  const fundo = [...document.body.children];
  const fechar = () => {
    document.removeEventListener('keydown', aoTeclar);
    trava?.release().catch(() => {});
    fundo.forEach((el) => (el.inert = false));
    tela.classList.add('saindo');
    const tirar = () => tela.remove();
    tela.addEventListener('animationend', tirar, { once: true });
    setTimeout(tirar, 320);
    if (antes?.isConnected) antes.focus({ preventScroll: true });
  };
  const aoTeclar = (e) => e.key === 'Escape' && fechar();

  desenhar();
  tela.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (q === 'fechar') fechar();
    if (q === 'mostrar') {
      mostrar = !mostrar;
      desenhar();
      tela.querySelector('[data-q="mostrar"]')?.focus({ preventScroll: true });
    }
  });
  fundo.forEach((el) => (el.inert = true));
  document.addEventListener('keydown', aoTeclar);
  document.body.append(tela);
  vibrarLeve();
  tela.querySelector('[data-q="fechar"]')?.focus({ preventScroll: true });
  // A web não controla o brilho; ao menos mantém a tela acesa enquanto o QR está aberto.
  try {
    trava = await navigator.wakeLock?.request('screen');
  } catch {
    /* sem trava de tela */
  }
}
