import { ler } from '../lib/armazenamento.js';
import { atualizarNotas, atualizarSemestre, listaDeSemestres, precisaLer, semestreEmCache } from '../lib/dados.js';
import { exameDaDisciplina, formatarNota, semestreCurto, situacaoApresentavel, situacaoFaltas, totalDaNota } from '../lib/dominio/academico.js';
import { rotuloAtualizado } from '../lib/dominio/formatos.js';
import { abrirFolha, anunciar, barraCompacta, botaoRedondo, cabecalho, cru, html, ic, montar, notaRodape, remontar, puxarParaAtualizar, vazio } from '../ui/componentes.js';
import { expirado, faixaExpirada, faixaFalha, fraseDeFalha } from './comum.js';

function blocoFaltas(d) {
  const s = situacaoFaltas(d.faltas, { cargaHoraria: d.cargaHoraria });
  if (!s) return '';
  const largura = Math.min(100, (s.faltas / (s.permitidas + 1)) * 100);
  const texto = s.nivel === 'limite' ? `${s.faltas} faltas: passou do limite de ${s.permitidas}` : `${s.faltas} de ${s.permitidas} faltas permitidas`;
  // Sem a carga horária da turma, o limite é o de uma disciplina de 60 h: deixar claro que é estimativa.
  const detalhe = s.estimado
    ? 'Estimativa: não consegui ler a carga horária desta disciplina.'
    : `Frequência ${s.frequencia}% · carga de ${s.cargaHoraria} h · a ${s.permitidas + 1}ª falta reprova`;
  return html`<div style="margin-top:10px"><div class="linha"><span class="apoio cresce">${texto}</span>${s.nivel !== 'tranquilo' ? html`<span class="selo ${s.nivel === 'limite' ? 'perigo' : ''}">${s.nivel === 'limite' ? 'Passou do limite' : 'Perto do limite'}</span>` : ''}</div>
    <div class="barra-faltas ${s.nivel}" role="meter" aria-valuemin="0" aria-valuemax="${s.permitidas + 1}" aria-valuenow="${s.faltas}" aria-valuetext="${s.faltas} faltas de ${s.permitidas} permitidas${s.estimado ? ', estimativa' : `, frequência ${s.frequencia}%`}" aria-label="Faltas"><div style="width:${largura}%"></div></div>
    <div class="apoio" style="margin-top:6px">${detalhe}</div></div>`;
}

/** "(50.00%)" do portal vira "50%"; "(12,50%)" fica "12,5%". */
const pesoCurto = (peso) => {
  const p = String(peso).replace(/[()]/g, '').trim();
  return p.includes('%') ? p.replace(/(\d+)[.,](\d*?)0*%/, (_, i, d) => (d ? `${i},${d}%` : `${i}%`)) : `(${p})`;
};

/** Nota mínima no exame, com a regra citada. Só fala da nota: aprovação e reprovação quem diz é o portal. */
function blocoExame(d, atual) {
  const e = exameDaDisciplina(d, { atual });
  if (!e) return '';
  return html`<div class="exame-necessario">
    <div class="forte">Para passar, você precisa de pelo menos ${formatarNota(e.necessaria)} no exame</div>
    <div class="apoio">Média parcial ${formatarNota(e.mediaParcial, 2)}. Média final = (média parcial + exame) ÷ 2, e passa quem chega a 5, com 75% de frequência (Regimento Geral da Ufac, arts. 319 e 320).</div>
  </div>`;
}

/** Esqueleto no formato de uma disciplina (nome, média à direita, barra de faltas): sem salto quando os dados chegam. */
function esqueletoDisciplinas() {
  return html`${[0, 1].map(() => html`<div class="cartao" aria-busy="true" aria-label="Carregando">
    <div class="linha"><div class="cresce"><div class="esqueleto" style="height:18px;width:70%"></div><div class="esqueleto" style="height:12px;width:35%;margin-top:8px"></div></div><div class="esqueleto" style="height:28px;width:44px"></div></div>
    <div class="esqueleto" style="height:8px;width:100%;margin-top:16px"></div></div>`)}`;
}

/** Pílula do cabeçalho que abre a lista de semestres. Com um semestre só, fica o texto de sempre. */
function seletorSemestre(semestres, s) {
  if (semestres.length < 2) return s.semestre;
  // O nome acessível começa pelo texto visível (WCAG 2.5.3): o Controle por Voz acha "2º / 2026".
  const curto = semestreCurto(s.semestre);
  return html`<button class="pilula-semestre tocavel" data-acao="semestres" aria-haspopup="dialog" aria-label="${curto}, trocar semestre"><span>${curto}</span>${ic('seta')}</button>`;
}

/** Folha com todos os semestres da página, o mais recente no topo. Resolve o nome escolhido (ou null). */
function escolherSemestre(semestres, visto) {
  return new Promise((resolve) => {
    let escolha = null;
    const { folha, fechar } = abrirFolha(html`
      <h2>Semestre</h2>
      <div class="lista-semestres">
        ${semestres.map((s) => html`<button class="item-semestre tocavel" data-semestre="${s.semestre}" ${s.semestre === visto ? cru('aria-current="true"') : ''}>
          <span class="cresce">${semestreCurto(s.semestre)}</span>
          ${s.atual ? html`<span class="selo">Atual</span>` : ''}
          ${s.semestre === visto ? html`<span class="visto-marca">${ic('check')}</span>` : ''}
        </button>`)}
      </div>
      <button class="botao largo claro tocavel" data-fechar style="margin-top:14px">Fechar</button>`, { aoFechar: () => resolve(escolha) });
    folha.addEventListener('click', (e) => {
      const item = e.target.closest('[data-semestre]');
      if (item) escolha = item.dataset.semestre;
      if (item || e.target.closest('[data-fechar]')) fechar();
    });
  });
}

export default async function notas(tela, { ir, acoes }) {
  let falha = '';
  let aberta = null;
  let escolhido = null; // null = semestre atual
  // Semestres sendo lidos agora (null = o atual): o atual e um anterior podem correr juntos.
  const lendo = new Set();

  async function desenhar() {
    const cache = await ler('notas');
    const semestres = listaDeSemestres(cache);
    const n = semestreEmCache(cache, escolhido);
    const vazioAinda = escolhido ? { semestre: escolhido, atual: false } : null;
    const s = n ?? vazioAinda;
    remontar(tela.querySelector('.pilha'), html`
      ${cabecalho({ titulo: 'Notas', sub: s ? html`${seletorSemestre(semestres, s)}${n?.lidoEm ? ` · ${rotuloAtualizado(n.lidoEm)}` : ''}` : 'Semestre atual', acoes: botaoRedondo('menu', 'Menu', 'menu') })}
      ${(await expirado('portal')) ? faixaExpirada('portal') : ''}
      ${falha ? faixaFalha(falha) : ''}
      ${!n
        ? lendo.has(escolhido) ? esqueletoDisciplinas() : html`<div class="cartao">${vazio('notas', escolhido ? 'Ainda não li as notas deste semestre' : 'Ainda não li suas notas', 'Puxe para baixo para tentar de novo.')}</div>`
        : n.disciplinas.length === 0
          ? html`<div class="cartao">${vazio('notas', 'Nenhuma disciplina neste semestre')}</div>`
          : n.disciplinas.map((d, i) => html`
            <section class="cartao">
              <button class="linha tocavel" style="width:100%;text-align:left" data-acao="abrir" data-valor="${i}" aria-expanded="${aberta === i}">
                <div class="cresce"><div class="forte">${d.disciplina}</div><div class="apoio">${situacaoApresentavel(d.situacao)}</div></div>
                <div style="text-align:right"><div class="rotulo">Média</div><div class="media-valor">${d.media || '—'}</div></div>
              </button>
              ${blocoFaltas(d)}
              ${aberta === i
                ? html`<table class="tabela-notas">${d.notas.map((nota) => html`<tr><td>${nota.rotulo}${nota.peso ? html` <span class="apoio">${pesoCurto(nota.peso)}</span>` : ''}</td><td>${totalDaNota(nota) || '—'}</td></tr>`)}
                    ${d.resumo.map((r) => html`<tr class="${/m[ée]dia final/i.test(r.rotulo) ? 'final' : ''}"><td>${r.rotulo}</td><td>${r.valor || '—'}</td></tr>`)}</table>
                    ${!d.notas.length && !d.resumo.length ? html`<div class="apoio" style="margin-top:8px">O portal ainda não publicou o quadro de notas.</div>` : ''}
                    ${blocoExame(d, n.atual)}`
                : ''}
            </section>`)}
      ${n ? notaRodape('É preciso ter 75% de frequência. As faltas permitidas dependem da carga horária de cada disciplina: 16 numa de 60 h, 8 numa de 30 h.') : ''}
    `);
  }

  montar(tela, html`<div class="pilha entra"></div>`);
  barraCompacta(tela, 'Notas');
  acoes.menu = () => ir('menu');
  acoes['entrar-portal'] = () => ir('login/portal');
  acoes.abrir = (el) => {
    const i = Number(el.dataset.valor);
    aberta = aberta === i ? null : i;
    desenhar();
  };
  acoes.semestres = async () => {
    const antes = await ler('notas');
    const nome = await escolherSemestre(listaDeSemestres(antes), escolhido ?? antes?.semestre);
    if (!nome) return;
    const cache = await ler('notas');
    const novo = nome === cache?.semestre ? null : nome;
    if (novo === escolhido) return;
    escolhido = novo;
    aberta = null;
    falha = '';
    anunciar(`Mostrando ${semestreCurto(nome)}`);
    // Semestre encerrado já lido: abre do cache, sem pedir nada à Ufac.
    if (precisaLer(cache, escolhido) && escolhido) await atualizar();
    else await desenhar();
  };

  if (!(await ler('notas'))) lendo.add(null);
  await desenhar();

  async function atualizar() {
    const alvo = escolhido;
    falha = '';
    lendo.add(alvo);
    await desenhar();
    try {
      if (alvo) await atualizarSemestre(alvo);
      else await atualizarNotas();
    } catch (e) {
      // A pessoa pode ter trocado de semestre enquanto este era lido: a frase é só do que está na tela.
      if (alvo === escolhido) falha = fraseDeFalha(e, 'o Portal', semestreEmCache(await ler('notas'), alvo)?.lidoEm);
    }
    lendo.delete(alvo);
    await desenhar();
  }
  // Voltar ao app (forcar: false) relê só o semestre atual, porque um encerrado não muda. "Tentar de novo"
  // (forcar: true) e puxar para atualizar releem o que está na tela.
  tela.addEventListener('atualizar', (e) => (e.detail?.forcar || !escolhido) && atualizar());
  puxarParaAtualizar(tela, atualizar);
  if (precisaLer(await ler('notas'), null)) await atualizar();
}
