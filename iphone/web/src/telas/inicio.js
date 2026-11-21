import { SemConexao } from '../lib/api.js';
import { gravar, ler } from '../lib/armazenamento.js';
import { atualizarCardapio, atualizarHorarios, atualizarIdentificacao, atualizarRu, recente } from '../lib/dados.js';
import { atualizarClassroom, classroomDisponivel, conectado, conectar, ErroClassroom } from '../lib/classroom.js';
import { iniciais, primeiroNome, proximaAula, semestreCurto } from '../lib/dominio/academico.js';
import { atividadesDaSemana } from '../lib/dominio/classroom.js';
import { avisoFeriado } from '../lib/dominio/feriados.js';
import { formatarData, formatarHoraMin, formatarPrazoCurto, rotuloAtualizado } from '../lib/dominio/formatos.js';
import { AVISO_REPETIDO, cardapioValeEm, itensDoCardapio, proximaRefeicao, refeicaoRepetida } from '../lib/dominio/refeicoes.js';
import { atualizarSelo, lerPrefs, sincronizarAgenda } from '../lib/push.js';
import { abreFora, avisar, barraCompacta, botaoRedondo, cabecalho, esqueleto, faixa, html, ic, montar, puxarParaAtualizar, remontar, vazio, vibrarLeve } from '../ui/componentes.js';
import { cartaoSaldo, escolherFoto, expirado, semEticket, faixaExpirada, faixaFalha, fotoOuIniciais, fraseDeFalha, soletrar } from './comum.js';
import { abrirQr } from './qr.js';

export default async function inicio(tela, { ir, acoes }) {
  // Uma falha por sistema: a do sistema com sessão vencida dá lugar à faixa "Entrar de novo".
  let falhas = {};
  let carregando = true;

  async function falhaVisivel() {
    const vencidos = (await ler('expirados')) ?? [];
    const sistemaDe = { 'o Portal': 'portal', 'o eTICKET': 'eticket' };
    const texto = Object.entries(falhas).find(([nome]) => !vencidos.includes(sistemaDe[nome]))?.[1];
    return texto ? faixaFalha(texto) : '';
  }

  async function desenhar() {
    const agora = new Date();
    const [ident, ru, horarios, cardapio, classroom, prefs] = await Promise.all([
      ler('identificacao'), ler('ru'), ler('horarios'), ler('cardapio'), ler('classroom'), lerPrefs(),
    ]);
    // Página do Portal que o app não reconheceu: oferece mandar a forma dela (sem dados pessoais) para corrigir.
    const diagnostico = !ident ? await ler('diagnosticoPortal') : null;
    const feriado = prefs.feriados ? avisoFeriado(agora) : null;
    const aula = horarios ? proximaAula(horarios.aulas, agora) : null;
    const refeicao = proximaRefeicao(agora);
    // Depois do jantar é o café de amanhã: a página do eTICKET não tem data, então nunca mostra o café de hoje como o de amanhã.
    const itens = !refeicao.amanha && cardapioValeEm(cardapio, agora) ? itensDoCardapio(cardapio.textos[refeicao.id]) : [];
    const repetida = itens.length > 0 && refeicaoRepetida(cardapio, refeicao.id);
    const atividades = classroom ? atividadesDaSemana(classroom.atividades, agora) : [];
    const nome = ident?.nome ?? '';
    const semRu = await semEticket();

    const vencidos = [];
    if (await expirado('portal')) vencidos.push('portal');
    if (await expirado('eticket')) vencidos.push('eticket');

    remontar(tela.querySelector('.pilha'), html`
      ${cabecalho({
        sobre: formatarData(agora),
        titulo: nome ? `Olá, ${primeiroNome(nome)}` : 'Olá',
        acoes: html`${botaoRedondo('sino', 'Avisos e notificações', 'avisos')}${botaoRedondo('menu', 'Menu', 'menu')}`,
      })}
      ${vencidos.length ? faixaExpirada(vencidos) : ''}
      ${feriado ? faixa({ icone: 'calendario', titulo: feriado.titulo, texto: feriado.texto, compacta: true }) : ''}
      ${await falhaVisivel()}

      <section class="cartao" aria-label="Identificação">
        ${ident
          ? html`
            <div class="linha">
              <button class="avatar tocavel" data-acao="foto" aria-label="Trocar foto">${await fotoOuIniciais(iniciais(nome))}</button>
              <div class="cresce"><div class="titulo-item">${nome}</div><div class="apoio">${ident.curso} · Ufac</div></div>
            </div>
            <div class="grade3">
              <button class="copiavel tocavel" data-acao="copiar-matricula" aria-label="Matrícula ${soletrar(ident.matricula)}. Toque para copiar"><div class="rotulo">Matrícula ${ic('copiar')}</div><div class="valor">${ident.matricula}</div></button>
              <div><div class="rotulo">Período</div><div class="valor">${ident.periodo}º</div></div>
              <div><div class="rotulo">Semestre</div><div class="valor">${semestreCurto(ident.semestre)}</div></div>
            </div>`
          : carregando
            ? esqueleto(3)
            : diagnostico
              ? html`${vazio('pessoa', 'O Portal abriu uma página que o app ainda não conhece')}<button class="botao largo claro tocavel" data-acao="relatar">Enviar diagnóstico</button><div class="nota-rodape" style="margin-top:8px">Vai sem nome, CPF nem matrícula. Você revisa antes de enviar.</div>`
              : html`${vazio('pessoa', 'Ainda não li seus dados do Portal')}<button class="botao largo claro tocavel" data-acao="entrar-portal">Entrar no Portal</button>`}
      </section>

      ${cartaoSaldo({ ru, semRu, carregando, agora })}

      <section class="cartao" aria-labelledby="rotulo-aula">
        <h2 class="rotulo" id="rotulo-aula" style="margin-bottom:6px">Próxima aula</h2>
        ${aula
          ? html`<span class="selo">${aula.rotulo}</span><div class="titulo-item" style="margin-top:8px">${aula.aula.disciplina}</div><div class="apoio">${formatarHoraMin(aula.aula.inicioMin)} – ${formatarHoraMin(aula.aula.fimMin)}</div>`
          : horarios
            ? vazio('horarios', 'Sem aula nos próximos dias')
            : esqueleto(2)}
      </section>

      <button class="cartao item tocavel" data-acao="refeicao">
        <span class="icone verde">${ic('ru')}</span>
        <span class="cresce">
          <span class="rotulo" style="display:block">Próxima refeição</span>
          <span class="titulo" style="display:block">${refeicao.amanha ? 'Amanhã · ' : ''}${refeicao.nome} · ${formatarHoraMin(refeicao.inicioMin)}</span>
          <span class="apoio sub">${itens.length ? itens.join(', ') : `O cardápio do ${refeicao.minusculo}${refeicao.amanha ? ' de amanhã' : ''} ainda não saiu`}</span>
          ${repetida ? html`<span class="apoio" style="display:block">${AVISO_REPETIDO}</span>` : ''}
        </span>
        <span class="seta">${ic('seta')}</span>
      </button>

      ${classroomDisponivel()
        ? html`<section class="cartao" aria-labelledby="rotulo-classroom">
            <div class="linha" style="margin-bottom:6px;align-items:baseline">
              <div class="cresce"><h2 class="titulo-cartao" id="rotulo-classroom" style="margin:0">Classroom</h2><div class="apoio">Atividades da semana</div></div>
              ${classroom ? html`<span class="apoio">${rotuloAtualizado(classroom.lidoEm, agora)}</span>` : ''}
            </div>
            ${atividades.length
              ? html`<div class="lista" style="margin:0 -16px">${atividades.slice(0, 5).map((a) => html`
                  <a class="item tocavel" href="${a.link ?? 'https://classroom.google.com/'}" target="_blank" rel="noopener">
                    <span class="icone ${a.situacao === 'atrasada' ? 'perigo' : ''}">${ic('quadro')}</span>
                    <span class="cresce"><span class="titulo">${a.titulo}</span><span class="apoio sub">${a.situacao === 'atrasada' ? 'Atrasada · ' : ''}${formatarPrazoCurto(new Date(a.prazo), agora)}${a.turma ? ` · ${a.turma}` : ''}</span></span>
                    ${abreFora}
                  </a>`)}</div>`
              : classroom
                ? vazio('check', 'Nada para entregar nesta semana')
                : vazio('quadro', 'Veja aqui o que vence no Classroom', 'Só leitura: o app não entrega nem altera nada.')}
            ${conectado()
              ? html`<a class="botao largo claro tocavel" style="margin-top:8px" href="https://classroom.google.com/" target="_blank" rel="noopener">${ic('abrir')} Abrir o Classroom${abreFora}</a>`
              : html`<button class="botao largo claro tocavel" style="margin-top:8px" data-acao="classroom">${ic('quadro')} ${classroom ? 'Conectar o Classroom de novo' : 'Conectar o Classroom'}</button>
                <div class="nota-rodape" style="margin-top:6px">Use a conta @sou.ufac.br. Você autoriza uma vez; o app só lê.</div>`}
          </section>`
        : ''}
    `);
  }

  montar(tela, html`<div class="pilha entra"></div>`);
  barraCompacta(tela, 'Início');
  await desenhar();

  async function atualizar({ forcar = false } = {}) {
    falhas = {};
    const tarefas = [];
    // Ao abrir, só o eTICKET é conferido; o Portal (sessão curta) só quando falta dado.
    if (!(await semEticket()) && (forcar || !(await recente('ru')))) tarefas.push(['o eTICKET', 'ru', atualizarRu]);
    tarefas.push(['o eTICKET', 'cardapio', () => atualizarCardapio({ forcar })]);
    if (forcar || !(await ler('identificacao'))) tarefas.push(['o Portal', 'identificacao', atualizarIdentificacao]);
    if (forcar || !(await ler('horarios'))) tarefas.push(['o Portal', 'horarios', atualizarHorarios]);
    // Classroom já autorizado: atualiza sozinho, sem toque (no máximo a cada 15 min, ou ao puxar).
    if (conectado() && (forcar || !(await recente('classroom')))) {
      tarefas.push(['o Classroom', 'classroom', async () => {
        try {
          await atualizarClassroom();
          atualizarSelo().catch(() => {});
        } catch (e) {
          if (!(e instanceof ErroClassroom)) throw e;
          if (e.pedirLogin) avisar(e.message);
          else if (e.bloqueado && !(await ler('classroomBloqueadoAvisado'))) {
            avisar(e.message);
            await gravar('classroomBloqueadoAvisado', true);
          }
        }
      }]);
    }
    // Cada sistema em sequência (a sessão de um pedido vale para o próximo), mas os sistemas em paralelo:
    // um eTICKET lento não segura o Portal nem o Classroom.
    const porSistema = new Map();
    for (const t of tarefas) porSistema.set(t[0], [...(porSistema.get(t[0]) ?? []), t]);
    await Promise.all([...porSistema.values()].map(async (fila) => {
      for (const [nome, chave, fn] of fila) {
        try {
          // null: a sessão caiu. No Portal, o próximo pedido cairia também; não gasta outro.
          if ((await fn()) === null && nome === 'o Portal') break;
        } catch (e) {
          falhas[nome] ??= fraseDeFalha(e, nome, (await ler(chave))?.lidoEm);
          if (e instanceof SemConexao) break; // sistema fora do ar: não espera de novo no próximo pedido
        }
      }
    }));
    carregando = false;
    await desenhar();
    sincronizarAgenda().catch(() => {});
  }

  acoes.menu = () => ir('menu');
  acoes.avisos = () => ir('configuracoes/avisos');
  acoes.qr = () => abrirQr();
  // Depois do jantar, abre o RU sem escolher refeição: ele explica que o de amanhã ainda não saiu.
  acoes.refeicao = () => {
    const r = proximaRefeicao(new Date());
    ir(r.amanha ? 'ru' : `ru/${r.id}`);
  };
  acoes['entrar-eticket'] = () => ir('login/eticket');
  acoes['entrar-portal'] = () => ir('login/portal');
  acoes['entrar-ambos'] = () => ir('login/ambos');
  acoes['copiar-matricula'] = async (el) => {
    // Lê o número da própria tela, sem esperar o banco: o Safari só deixa copiar dentro do toque.
    const matricula = el.querySelector('.valor')?.textContent.trim();
    if (!matricula) return;
    try {
      await navigator.clipboard.writeText(matricula);
      vibrarLeve();
      avisar('Matrícula copiada', { ok: true });
    } catch {
      avisar('Não consegui copiar agora.');
    }
  };
  acoes.foto = async () => (await escolherFoto()) && desenhar();
  acoes.classroom = async () => {
    try {
      if (!conectado()) return await conectar(); // vai ao Google e volta para a Início
      await atualizarClassroom();
      await desenhar();
      sincronizarAgenda().catch(() => {});
      atualizarSelo();
    } catch (e) {
      avisar(e instanceof ErroClassroom ? e.message : 'Não consegui ler o Classroom agora.');
    }
  };
  tela.addEventListener('sessao', desenhar);
  tela.addEventListener('atualizar', (e) => atualizar({ forcar: !!e.detail?.forcar }));
  puxarParaAtualizar(tela, () => atualizar({ forcar: true }));
  await atualizar();
}
