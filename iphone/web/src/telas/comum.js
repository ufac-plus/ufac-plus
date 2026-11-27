// Pedaços usados por mais de uma tela.
import { ler, gravar } from '../lib/armazenamento.js';
import { SemConexao } from '../lib/api.js';
import { ErroLeitura } from '../lib/dados.js';
import { abreFora, avisar, confirmar, faixa, html, ic } from '../ui/componentes.js';
import { formatarHora, formatarMoeda, rotuloAtualizado } from '../lib/dominio/formatos.js';
import { saldoBaixo } from '../lib/dominio/saldo.js';
import { URL_RECARGA } from '../lib/config.js';
import { sair } from '../lib/sessao.js';

/** Frase humana para uma falha de leitura, com a saída (puxar) e a hora dos dados que continuam na tela. */
export function fraseDeFalha(erro, nome, lidoEm) {
  const quando = lidoEm ? ` Mostrando dados das ${formatarHora(new Date(lidoEm).getHours(), new Date(lidoEm).getMinutes())}.` : '';
  if (erro instanceof SemConexao) return `Não consegui falar com ${nome} agora.${quando}`;
  if (erro instanceof ErroLeitura) return `${erro.message}${quando}`;
  return `Não consegui ler ${nome} agora.${quando}`;
}

/** Falha passageira: a ação principal é tentar de novo; relatar fica discreto ao lado. */
export const faixaFalha = (texto) =>
  faixa({ icone: 'semConexao', titulo: texto, acao: 'tentar-de-novo', rotuloAcao: 'Tentar de novo', acao2: 'relatar', rotuloAcao2: 'Relatar' });

// Lido por expirado() logo antes de cada faixaExpirada(): todas as telas chamam as duas juntas.
let pedeSenhaNova = false;

/**
 * Sessão que caiu. Uma faixa só, mesmo com Portal e eTICKET vencidos juntos (antes eram duas, que empurravam
 * os cartões para baixo da barra de abas). sistemas: 'portal' | 'eticket' | ['portal', 'eticket'].
 */
export const faixaExpirada = (sistemas) => {
  const lista = [sistemas].flat();
  const portal = lista.includes('portal');
  if (portal && pedeSenhaNova) {
    return faixa({
      icone: 'cadeado',
      titulo: 'O Portal pede uma senha nova',
      texto: 'Troque no site da Ufac e depois entre de novo aqui com a senha nova.',
      acao: 'trocar-senha-portal',
      rotuloAcao: 'Abrir o site',
    });
  }
  const ambos = portal && lista.includes('eticket');
  return faixa({
    icone: 'cadeado',
    titulo: ambos ? 'O Portal e o eTICKET pedem login de novo' : portal ? 'Sua sessão do Portal terminou' : 'Sua sessão do eTICKET terminou',
    texto: 'Os dados salvos continuam aqui.',
    acao: ambos ? 'entrar-ambos' : portal ? 'entrar-portal' : 'entrar-eticket',
    rotuloAcao: 'Entrar de novo',
  });
};

export async function expirado(sistema) {
  if (sistema === 'eticket' && (await semEticket())) return false; // nunca entrou no eTICKET: o aviso é outro
  if (sistema !== 'eticket') pedeSenhaNova = (await ler('portalPedeSenha')) === true;
  return ((await ler('expirados')) ?? []).includes(sistema);
}

export const semEticket = async () => (await ler('semEticket')) === true;

/**
 * Aviso para quem entrou só com o Portal, nas abas sem cartão do RU (Horários e Relatórios). Na Início e no RU
 * o próprio cartão do saldo faz esse convite, para não repetir a mesma chamada.
 */
export async function avisoSemEticket() {
  if (!(await semEticket())) return '';
  return faixa({
    icone: 'ru',
    titulo: 'Conecte o eTICKET do RU',
    texto: 'Para ver o saldo, o QR de entrada e o histórico do RU.',
    tipo: 'eticket',
    acao: 'conectar-eticket',
    rotuloAcao: 'Conectar',
  });
}

/**
 * Cartão do saldo do RU (Início e aba RU). largo: botões um embaixo do outro, com texto mais longo (aba RU).
 * O valor e a hora formam um grupo só para o leitor de tela.
 */
export function cartaoSaldo({ ru, semRu, carregando, agora, largo = false, rotulo = 'Saldo no RU', avisarSaldo = false }) {
  const valor = semRu
    ? html`<div class="saldo-ausente">eTICKET não conectado</div><div class="apoio">Conecte para ver o saldo e o QR de entrada.</div>`
    : ru
      ? html`<div class="saldo"><span class="moeda">R$</span> ${formatarMoeda(ru.saldo).replace(/^R\$\s*/, '')}</div><div class="apoio">${rotuloAtualizado(ru.lidoEm, agora)}</div>`
      : carregando
        ? html`<div class="esqueleto" style="height:44px;width:55%;margin:10px 0" aria-label="Carregando o saldo"></div>`
        : html`<div class="saldo-ausente">Saldo indisponível</div><div class="apoio">Puxe para baixo para tentar de novo.</div>`;
  const conectar = html`<button class="botao acento ${largo ? 'largo' : ''} tocavel" data-acao="conectar-eticket">${ic('ru')} Conectar o eTICKET</button>`;
  const qr = html`<button class="botao acento ${largo ? 'largo' : ''} tocavel" data-acao="qr">${ic('qr')} ${largo ? 'Mostrar QR de entrada' : 'Mostrar QR'}</button>`;
  const recarga = html`<a class="botao contorno ${largo ? 'largo' : ''} tocavel" href="${URL_RECARGA}" target="_blank" rel="noopener">${ic('mais')} ${largo ? 'Recarregar créditos' : 'Recarregar'}${abreFora}</a>`;
  const baixo = avisarSaldo && !semRu && saldoBaixo(ru);
  return html`
    <section class="cartao tingido" aria-labelledby="rotulo-saldo">
      <h2 class="rotulo" id="rotulo-saldo">${rotulo}</h2>
      <div role="group">${valor}</div>
      ${baixo ? html`<div class="aviso-saldo" role="status">${ic('alerta')}<span>Saldo baixo · recarregue antes da próxima refeição</span></div>` : ''}
      ${largo
        ? html`<div class="pilha" style="gap:10px;margin-top:16px">${semRu ? conectar : html`${qr}${recarga}`}</div>
          <div class="apoio nota-rodape" style="margin-top:10px;padding:0">${semRu ? 'O cardápio abaixo funciona sem o eTICKET.' : 'A recarga abre o site oficial do eTICKET no Safari.'}</div>`
        : html`<div class="par-botoes">${semRu ? conectar : html`${qr}${recarga}`}</div>`}
    </section>`;
}

/** Número lido dígito a dígito pelo leitor de tela (senão vira "doze bilhões…"). */
export const soletrar = (n) => String(n ?? '').split('').join(' ');

/** Sair da conta: a mesma pergunta no Menu e nas Configurações, dizendo tudo o que é apagado. */
export async function confirmarSaida(ir) {
  const ok = await confirmar({
    titulo: 'Sair da conta?',
    texto: 'Apaga deste iPhone a sessão, a senha salva, o QR do RU, a foto e os dados salvos. O Classroom e as notificações também são desligados.',
    sim: 'Sair da conta',
    perigo: true,
  });
  if (!ok) return;
  await sair();
  ir('boas-vindas', { substituir: true });
}

export const FALHA_FOTO = 'Não consegui abrir essa foto. Tente outra ou salve-a no iPhone antes.';
const PRAZO_FOTO_MS = 20000; // foto do iCloud ainda baixando pode nunca terminar: não deixar o toque pendurado

const comPrazo = (promessa, ms) => Promise.race([promessa, new Promise((_, nao) => setTimeout(() => nao(new Error('prazo')), ms))]);

/** Abre a imagem: createImageBitmap primeiro; se ele recusar (HEIC em iOS antigo), tenta pelo <img>, que o Safari decodifica. */
async function abrirImagem(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(blob);
      if (b.width && b.height) return { fonte: b, largura: b.width, altura: b.height, soltar: () => b.close?.() };
    } catch {
      /* segue para o <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    if (img.decode) await img.decode();
    else await new Promise((ok, nao) => ((img.onload = ok), (img.onerror = nao)));
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error('imagem vazia');
  }
  return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, soltar: () => URL.revokeObjectURL(url) };
}

/** Recorta no centro em quadrado e reduz a 512 px (JPEG). Lança se a foto não abrir. */
export async function reduzirFoto(arquivo) {
  // Ler os bytes antes garante que a foto já chegou (do iCloud) e não muda no meio da leitura.
  const bytes = await arquivo.arrayBuffer();
  if (!bytes.byteLength) throw new Error('arquivo vazio');
  const imagem = await abrirImagem(new Blob([bytes], { type: arquivo.type || 'image/jpeg' }));
  try {
    const lado = Math.min(imagem.largura, imagem.altura);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sem canvas');
    ctx.drawImage(imagem.fonte, (imagem.largura - lado) / 2, (imagem.altura - lado) / 2, lado, lado, 0, 0, 512, 512);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.86));
    if (!blob?.size) throw new Error('sem jpeg');
    return blob;
  } finally {
    imagem.soltar();
  }
}

/** Foto de perfil: escolhida da galeria, recortada em quadrado e reduzida a 512 px. Fica só no iPhone. */
export function escolherFoto() {
  return new Promise((resolve) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'image/*';
    entrada.tabIndex = -1;
    entrada.setAttribute('aria-hidden', 'true');
    entrada.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    // No DOM até o fim: o Safari pode descartar um <input> solto antes do change chegar.
    document.body.append(entrada);
    let terminou = false;
    const terminar = (valor) => {
      if (terminou) return;
      terminou = true;
      entrada.remove();
      resolve(valor);
    };
    entrada.addEventListener('cancel', () => terminar(false));
    entrada.addEventListener('change', async () => {
      const arquivo = entrada.files?.[0];
      if (!arquivo) return terminar(false);
      try {
        const blob = await comPrazo(reduzirFoto(arquivo), PRAZO_FOTO_MS);
        // Bytes, não Blob: o WebKit às vezes recusa gravar um Blob no IndexedDB (e a foto não ficava).
        await gravar('foto', { bytes: await blob.arrayBuffer(), tipo: blob.type || 'image/jpeg' });
        await gravar('fotoVersao', String(Date.now()));
        terminar(true);
      } catch {
        avisar(FALHA_FOTO);
        terminar(false);
      } finally {
        entrada.value = ''; // escolher a mesma foto de novo volta a disparar o change
      }
    });
    entrada.value = '';
    entrada.click();
  });
}

// A mesma foto mantém o mesmo endereço: um endereço novo a cada desenho fazia a foto piscar.
let urlFoto;
let versaoFoto;
export async function fotoOuIniciais(iniciais) {
  const guardada = await ler('foto');
  // Fotos antigas foram gravadas como Blob; as novas, como { bytes, tipo }.
  const foto = guardada instanceof Blob ? guardada : guardada?.bytes ? new Blob([guardada.bytes], { type: guardada.tipo }) : null;
  if (!foto) return html`${iniciais}`;
  const versao = (await ler('fotoVersao')) ?? `${foto.size}|${foto.type}`;
  if (!urlFoto || versao !== versaoFoto) {
    if (urlFoto) URL.revokeObjectURL(urlFoto);
    urlFoto = URL.createObjectURL(foto);
    versaoFoto = versao;
  }
  return html`<img src="${urlFoto}" alt="Sua foto">`;
}
