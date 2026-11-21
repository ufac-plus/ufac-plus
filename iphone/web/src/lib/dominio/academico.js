// Regras do Portal. Porte de lib/data/academico.dart.
import { deDataISO, diaDaSemana, formatarHoraMin, soData } from './formatos.js';
import { semAulaPorFeriado } from './feriados.js';

/**
 * Faltas: numa disciplina de 60 h pode ter até 16 e a 17ª reprova (decisão de Arthur).
 * Vale sem a carga horária da disciplina, como estimativa.
 */
export const LIMITE_FALTAS = 16;

/**
 * Regimento Geral da Ufac, arts. 314, I, e 320, II: reprova quem não tem 75% de frequência
 * nas atividades programadas. O portal conta as faltas por hora-aula (uma por período da chamada,
 * e 2 h de aula são 2 períodos). As 16 de Arthur numa de 60 h equivalem a 25% de 64 aulas
 * programadas, ou seja, a carga × 16/15 (16 semanas para um crédito de 15 h). Assim o limite
 * escala com a carga: 30 h → 8, 45 h → 12, 60 h → 16, 90 h → 24.
 */
export const aulasProgramadas = (cargaHoraria) => (cargaHoraria * LIMITE_FALTAS) / 60 / 0.25;
// Para baixo: com uma carga que não é múltipla de 15 h (ex.: 40 h), arredondar para cima deixaria a última
// falta "permitida" abaixo dos 75%. Nas cargas comuns (30, 45, 60, 75, 90 h) dá o mesmo número.
export const faltasPermitidas = (cargaHoraria) => Math.floor((cargaHoraria * LIMITE_FALTAS) / 60 + 1e-9);

export const primeiroNome = (nome) => nome.split(' ')[0];

export function iniciais(nome) {
  const partes = nome.split(' ').filter(Boolean);
  if (partes.length === 0) return '';
  return partes.length < 2 ? partes[0][0] : partes[0][0] + partes[partes.length - 1][0];
}

/** Aula = { disciplina, diaSemana (1..7), inicioMin, fimMin, valeDe?, valeAte? } (datas em ISO). */
export function aulaValeNoDia(aula, dia) {
  const d = soData(dia).getTime();
  const de = aula.valeDe ? deDataISO(aula.valeDe).getTime() : null;
  const ate = aula.valeAte ? deDataISO(aula.valeAte).getTime() : null;
  return (de === null || d >= de) && (ate === null || d <= ate);
}

const DIAS_CURTOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** A aula em andamento ou a próxima nos próximos 7 dias, pulando feriados. Null se não houver nenhuma. */
export function proximaAula(aulas, agora) {
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  for (let d = 0; d < 7; d++) {
    const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + d);
    if (semAulaPorFeriado(dia)) continue; // a faixa diz "Sem aulas": o cartão não pode dizer "em andamento"
    const doDia = aulas
      .filter((a) => a.diaSemana === diaDaSemana(dia) && aulaValeNoDia(a, dia))
      .sort((a, b) => a.inicioMin - b.inicioMin);
    for (const a of doDia) {
      if (d === 0 && a.fimMin <= minutos) continue;
      if (d === 0 && a.inicioMin <= minutos) return { aula: a, rotulo: 'em andamento', emAndamento: true };
      if (d === 0) {
        const falta = a.inicioMin - minutos;
        return { aula: a, rotulo: falta < 60 ? `começa em ${falta} min` : `hoje às ${formatarHoraMin(a.inicioMin)}` };
      }
      if (d === 1) return { aula: a, rotulo: `amanhã às ${formatarHoraMin(a.inicioMin)}` };
      return { aula: a, rotulo: `${DIAS_CURTOS[diaDaSemana(dia) - 1]} às ${formatarHoraMin(a.inicioMin)}` };
    }
  }
  return null;
}

/** "2° Semestre / 2026" vira "2º / 2026". */
export function semestreCurto(semestre) {
  const m = /(\d+)\D+(\d{4})/.exec(semestre);
  return m ? `${m[1]}º / ${m[2]}` : semestre;
}

/**
 * Reprova quem passa das faltas permitidas pela carga horária (regra acima). Sem a carga, usa
 * `permitidasSemCarga` e marca `estimado`. `percentual` troca a regra por floor(carga × percentual).
 * O aviso começa em 75% das faltas permitidas. `frequencia` (0 a 100, arredondada para baixo, para
 * nunca parecer maior do que é) só existe com a carga. Null quando o portal ainda não informa faltas.
 */
export function situacaoFaltas(faltas, { cargaHoraria = null, percentual = null, permitidasSemCarga = LIMITE_FALTAS } = {}) {
  const t = String(faltas ?? '').trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  const carga = Number(cargaHoraria) > 0 ? Number(cargaHoraria) : null;
  const permitidas = carga == null ? permitidasSemCarga : percentual != null ? Math.floor(carga * percentual) : faltasPermitidas(carga);
  const aviso = Math.ceil(permitidas * 0.75);
  const nivel = n > permitidas ? 'limite' : n >= aviso ? 'atencao' : 'tranquilo';
  // Mesma base do limite: com as faltas permitidas, a frequência fica em 75% exatos.
  const base = carga == null ? null : percentual != null ? carga : aulasProgramadas(carga);
  const frequencia = base == null ? null : Math.max(0, Math.floor(((base - n) / base) * 100 + 1e-9));
  return { faltas: n, permitidas, nivel, estimado: carga == null, cargaHoraria: carga, frequencia };
}

/** O quadro de horários e a lista de notas escrevem o nome com detalhes diferentes. */
export const nomeDeDisciplinaComparavel = (nome) =>
  nome.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function notasDaDisciplina(notas, disciplina) {
  const alvo = nomeDeDisciplinaComparavel(disciplina);
  return notas?.find((n) => nomeDeDisciplinaComparavel(n.disciplina) === alvo) ?? null;
}

/** O portal chama de "Matrícula" a disciplina em andamento. */
export const situacaoApresentavel = (s) => (s === 'Matrícula' ? 'Cursando' : s);

/** O total de uma coluna "Nota 1" é o último item. */
export const totalDaNota = (nota) => (nota.itens.length ? nota.itens[nota.itens.length - 1].valor : '');

/** "6,50", "6.5" ou 7 viram número; vazio, "—" e texto, null. */
export function lerNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const t = String(valor ?? '').trim();
  return /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : null;
}

export const formatarNota = (n, casas = 1) => n.toFixed(casas).replace('.', ',');

/**
 * Regimento Geral da Ufac (Res. CONSU 33/2011, alterada pelas 43/2011 e 50/2013): com média parcial (MP) 8 ou
 * mais passa sem exame (art. 316); MP zero não tem exame (art. 317); MF = (MP + EF) ÷ 2 (art. 319) e reprova
 * com MF abaixo de 5 (art. 320, III). Logo EF = 10 − MP, arredondado para cima na 1ª casa (art. 305), para nunca faltar.
 */
export function notaNecessariaNoExame(mp) {
  if (typeof mp !== 'number' || !(mp > 0 && mp < 8)) return null;
  return Math.ceil((10 - mp) * 10 - 1e-9) / 10;
}

const doResumo = (d, rotulo) => d.resumo?.find((r) => r.rotulo.trim().toLowerCase() === rotulo)?.valor ?? '';

/**
 * Nota mínima no exame, só no semestre atual e só enquanto o portal não lançou exame nem média final (o que ele
 * disser vale mais). Exige todas as notas lançadas (senão a MP ainda vai mudar) e as faltas dentro do limite
 * (art. 317), conhecido pela carga horária. Null quando não se aplica.
 */
export function exameDaDisciplina(d, { atual }) {
  if (!atual || !d?.notas?.length) return null;
  if (d.notas.some((n) => lerNumero(totalDaNota(n)) == null)) return null;
  if (lerNumero(doResumo(d, 'exame')) != null || lerNumero(doResumo(d, 'média final')) != null || lerNumero(d.media) != null) return null;
  const faltas = situacaoFaltas(d.faltas, { cargaHoraria: d.cargaHoraria });
  if (faltas?.nivel === 'limite') return null;
  // Sem a carga horária o limite é estimativa (o de 60 h): com alguma falta, pode já ter passado do limite real.
  if (faltas?.estimado && faltas.faltas > 0) return null;
  const mediaParcial = lerNumero(doResumo(d, 'média'));
  const necessaria = notaNecessariaNoExame(mediaParcial);
  return necessaria == null ? null : { mediaParcial, necessaria };
}
