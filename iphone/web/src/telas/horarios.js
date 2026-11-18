import { ler } from '../lib/armazenamento.js';
import { atualizarHorarios, atualizarProfessor } from '../lib/dados.js';
import { aulaValeNoDia } from '../lib/dominio/academico.js';
import { DIAS, MESES, diaDaSemana, formatarHoraMin, rotuloAtualizado } from '../lib/dominio/formatos.js';
import { aulasDoProfessor } from '../lib/dominio/professor.js';
import { sincronizarAgenda } from '../lib/push.js';
import { barraCompacta, botaoRedondo, cabecalho, esqueleto, html, montar, notaRodape, remontar, puxarParaAtualizar, vazio } from '../ui/componentes.js';
import { avisoSemEticket, faixaExpirada, faixaFalha, fraseDeFalha, expirado } from './comum.js';

export default async function horarios(tela, { ir, perfil, acoes }) {
  let falha = '';
  const professor = perfil === 'professor';

  async function desenhar(carregando = false) {
    const agora = new Date();
    const hoje = diaDaSemana(agora);
    const dados = professor ? await ler('professor') : await ler('horarios');
    const aulas = professor ? aulasDoProfessor(dados?.turmas ?? []) : dados?.aulas;
    // Cada dia da semana a partir de hoje, com a data real (para respeitar o período da turma).
    const dias = Array.from({ length: 7 }, (_, i) => {
      const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
      const lista = (aulas ?? []).filter((a) => a.diaSemana === diaDaSemana(data) && aulaValeNoDia(a, data)).sort((a, b) => a.inicioMin - b.inicioMin);
      return { data, lista };
    }).filter((d, i) => i === 0 || d.lista.length);

    remontar(tela.querySelector('.pilha'), html`
      ${cabecalho({ titulo: 'Horários', sub: dados ? rotuloAtualizado(dados.lidoEm, agora) : 'Semana', acoes: botaoRedondo('menu', 'Menu', 'menu') })}
      ${professor ? '' : await avisoSemEticket()}
      ${(await expirado(professor ? 'professor' : 'portal')) && !dados ? faixaExpirada('portal') : ''}
      ${falha ? faixaFalha(falha) : ''}
      ${!aulas
        ? html`<div class="cartao">${carregando ? esqueleto(4) : vazio('horarios', 'Ainda não li seus horários', 'Puxe para baixo para tentar de novo.')}</div>`
        : dias.map(({ data, lista }) => html`
          <section class="cartao dia ${diaDaSemana(data) === hoje && data.getDate() === agora.getDate() ? 'hoje' : ''}">
            <h2 class="nome" style="font-size:var(--fs-corpo)"><span>${data.getDate() === agora.getDate() ? `${DIAS[diaDaSemana(data) - 1]} · hoje` : `${DIAS[diaDaSemana(data) - 1]}, ${data.getDate()} de ${MESES[data.getMonth()].slice(0, 3)}`}</span></h2>
            ${lista.length
              ? lista.map((a) => html`<div class="aula"><div class="hora">${formatarHoraMin(a.inicioMin)}<small>${formatarHoraMin(a.fimMin)}</small></div><div class="cresce forte">${a.disciplina}</div></div>`)
              : html`<div class="apoio">Sem aula hoje</div>`}
          </section>`)}
      ${aulas ? notaRodape('O portal não informa a sala das aulas.') : ''}
    `);
  }

  montar(tela, html`<div class="pilha entra"></div>`);
  barraCompacta(tela, 'Horários');
  acoes.menu = () => ir('menu');
  acoes['entrar-portal'] = () => ir('login/portal');
  const tem = professor ? await ler('professor') : await ler('horarios');
  await desenhar(!tem);

  async function atualizar() {
    falha = '';
    try {
      await (professor ? atualizarProfessor() : atualizarHorarios());
      sincronizarAgenda().catch(() => {});
    } catch (e) {
      falha = fraseDeFalha(e, 'o Portal', (await ler(professor ? 'professor' : 'horarios'))?.lidoEm);
    }
    await desenhar();
  }
  tela.addEventListener('atualizar', atualizar);
  puxarParaAtualizar(tela, atualizar);
  if (!tem) await atualizar();
}
