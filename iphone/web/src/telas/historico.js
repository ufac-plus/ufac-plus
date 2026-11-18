import { ler } from '../lib/armazenamento.js';
import { atualizarHistorico } from '../lib/dados.js';
import { formatarDataCurta, formatarMoeda, rotuloAtualizado } from '../lib/dominio/formatos.js';
import { botaoRedondo, cabecalho, esqueleto, html, marcarSegmento, montar, remontar, puxarParaAtualizar, segmentos, vazio } from '../ui/componentes.js';
import { faixaFalha, fraseDeFalha } from './comum.js';

/** "01/10/2026" (eTICKET) vira "qui, 1 de out"; o que não for data fica como veio. */
function dataCurta(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  return m ? formatarDataCurta(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : texto;
}

export default async function historico(tela, { voltar, ir, acoes }) {
  let aba = 'refeicoes';
  let falha = '';
  async function desenhar(carregando = false) {
    const h = await ler('historico');
    const lista = h?.[aba] ?? [];
    remontar(tela.querySelector('.pilha'), html`
      ${cabecalho({ titulo: 'Histórico', sub: h ? rotuloAtualizado(h.lidoEm) : 'eTICKET', acoes: botaoRedondo('voltar', 'Voltar', 'voltar') })}
      ${falha ? faixaFalha(falha) : ''}
      ${segmentos([{ id: 'refeicoes', nome: 'Refeições' }, { id: 'recargas', nome: 'Recargas' }], aba, 'aba', 'Tipo de histórico')}
      <section class="cartao lista">
        ${!h
          ? html`<div style="padding:16px">${carregando ? esqueleto(4) : vazio('historico', 'Ainda não li o histórico')}</div>`
          : !lista.length
            ? vazio('historico', aba === 'refeicoes' ? 'Nenhuma refeição registrada' : 'Nenhuma recarga registrada')
            : aba === 'refeicoes'
              ? lista.map((r) => html`<div class="item"><span class="cresce"><span class="titulo">${r.refeicao || 'Refeição'}${r.prato ? ` · ${r.prato}` : ''}</span><span class="apoio sub">${dataCurta(r.data)} às ${r.hora} · ${r.status}</span></span><span class="forte">${r.valor != null ? formatarMoeda(r.valor) : ''}</span></div>`)
              : lista.map((r) => html`<div class="item"><span class="cresce"><span class="titulo">${r.forma || 'Recarga'}</span><span class="apoio sub">${dataCurta(r.data)} às ${r.hora} · ${r.situacao}</span></span><span class="forte" style="color:var(--green)">${r.valor != null ? `+ ${formatarMoeda(r.valor)}` : ''}</span></div>`)}
      </section>`);
  }
  montar(tela, html`<div class="pilha entra"></div>`);
  acoes.voltar = voltar;
  acoes.aba = (el) => {
    aba = el.dataset.valor;
    marcarSegmento(el);
    setTimeout(desenhar, 160);
  };
  const tem = await ler('historico');
  await desenhar(!tem);
  async function atualizar() {
    falha = '';
    try {
      if ((await atualizarHistorico()) === null) return ir('login/eticket');
    } catch (e) {
      falha = fraseDeFalha(e, 'o eTICKET', (await ler('historico'))?.lidoEm);
    }
    await desenhar();
  }
  tela.addEventListener('atualizar', atualizar);
  puxarParaAtualizar(tela, atualizar);
  await atualizar();
}
