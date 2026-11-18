import { SemConexao } from '../lib/api.js';
import { ler } from '../lib/armazenamento.js';
import { atualizarCardapio, atualizarRu } from '../lib/dados.js';
import { INSTAGRAM_RU } from '../lib/config.js';
import { formatarData, formatarHoraMin } from '../lib/dominio/formatos.js';
import { REFEICOES, cardapioValeEm, itensDoCardapio, proximaRefeicao } from '../lib/dominio/refeicoes.js';
import { abreFora, barraCompacta, botaoRedondo, cabecalho, esqueleto, html, ic, item, marcarSegmento, montar, puxarParaAtualizar, remontar, segmentos } from '../ui/componentes.js';
import { cartaoSaldo, expirado, faixaExpirada, faixaFalha, fraseDeFalha, semEticket } from './comum.js';
import { abrirQr } from './qr.js';

/** Diz se o eTICKET ainda não publicou (e quando conferimos) ou se a refeição já passou sem cardápio. */
function fraseSemCardapio(refeicao, cardapio, deHoje, agora) {
  const conferido = deHoje ? ` Conferido no eTICKET às ${formatarHoraMin(new Date(cardapio.lidoEm).getHours() * 60 + new Date(cardapio.lidoEm).getMinutes())}.` : '';
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos >= refeicao.fimMin) return `O eTICKET não publicou o cardápio do ${refeicao.minusculo} de hoje.${conferido}`;
  return `O cardápio do ${refeicao.minusculo} ainda não saiu. Costuma aparecer perto do horário.${conferido}`;
}

export default async function ru(tela, { ir, parametro, acoes }) {
  let escolhida = REFEICOES.some((r) => r.id === parametro) ? parametro : proximaRefeicao(new Date()).id;
  let falha = '';
  let carregando = true;

  async function desenhar() {
    const agora = new Date();
    const [saldo, cardapio] = await Promise.all([ler('ru'), ler('cardapio')]);
    const refeicao = REFEICOES.find((r) => r.id === escolhida);
    const deHoje = cardapioValeEm(cardapio, agora);
    const itens = deHoje ? itensDoCardapio(cardapio.textos[refeicao.id]) : [];
    const semRu = await semEticket();
    remontar(tela.querySelector('.pilha'), html`
      ${cabecalho({ titulo: 'RU', sub: 'Restaurante Universitário · Ufac', acoes: botaoRedondo('menu', 'Menu', 'menu') })}
      ${(await expirado('eticket')) ? faixaExpirada('eticket') : ''}
      ${falha ? faixaFalha(falha) : ''}
      ${cartaoSaldo({ ru: saldo, semRu, carregando, agora, largo: true, rotulo: 'Saldo' })}
      <section class="cartao" aria-labelledby="titulo-cardapio">
        <h2 id="titulo-cardapio" style="margin-bottom:2px">Cardápio de hoje</h2>
        <div class="apoio" style="margin-bottom:12px">${formatarData(agora)}</div>
        ${segmentos(REFEICOES.map((r) => ({ id: r.id, nome: r.nome, sub: formatarHoraMin(r.inicioMin) })), escolhida, 'refeicao', 'Refeição')}
        <div aria-live="polite">
        ${itens.length
          ? html`<ul class="lista-cardapio">${itens.map((i) => html`<li>${i}</li>`)}</ul>`
          : carregando && !deHoje
            ? esqueleto(3)
            : html`<div class="apoio" style="font-size:var(--fs-corpo)">${fraseSemCardapio(refeicao, cardapio, deHoje, agora)}</div>
                <a class="botao claro largo tocavel" style="margin-top:12px" href="${INSTAGRAM_RU}" target="_blank" rel="noopener">${ic('camera')} Ver no Instagram do RU${abreFora}</a>`}
        </div>
      </section>
      <section class="cartao lista">
        ${item({ icone: 'historico', titulo: 'Histórico de uso', sub: semRu ? 'Precisa do eTICKET conectado' : 'Refeições e recargas', acao: semRu ? 'conectar-eticket' : 'historico' })}
      </section>
    `);
  }

  montar(tela, html`<div class="pilha entra"></div>`);
  barraCompacta(tela, 'RU');
  await desenhar();

  async function atualizar(forcar) {
    falha = '';
    for (const [chave, fn] of [['ru', atualizarRu], ['cardapio', () => atualizarCardapio({ forcar })]]) {
      try {
        await fn();
      } catch (e) {
        falha ||= fraseDeFalha(e, 'o eTICKET', (await ler(chave))?.lidoEm);
        if (e instanceof SemConexao) break; // eTICKET fora do ar: não espera de novo pelo cardápio
      }
    }
    carregando = false;
    await desenhar();
  }

  acoes.menu = () => ir('menu');
  acoes.qr = () => abrirQr();
  acoes.historico = () => ir('historico');
  acoes['entrar-eticket'] = () => ir('login/eticket');
  acoes.refeicao = (el) => {
    escolhida = el.dataset.valor;
    marcarSegmento(el);
    setTimeout(desenhar, 160);
  };
  tela.addEventListener('sessao', desenhar);
  tela.addEventListener('atualizar', (e) => atualizar(!!e.detail?.forcar));
  puxarParaAtualizar(tela, () => atualizar(true));
  await atualizar(false);
}
