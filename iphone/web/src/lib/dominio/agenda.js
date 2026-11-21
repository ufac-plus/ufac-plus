// Arquivo .ics (iCalendar, RFC 5545) com as aulas da semana, gerado no próprio iPhone.
// Nada sai do aparelho: a pessoa abre o arquivo e o app Calendário importa.
import { deDataISO, soData } from './formatos.js';
import { semAulaPorFeriado } from './feriados.js';

export const FUSO = 'America/Rio_Branco';
const DIAS_ICS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']; // diaSemana 1..7 (segunda..domingo)
const MESES_PADRAO = 4; // sem o fim do período no portal, repete por 4 meses

const dois = (n) => String(n).padStart(2, '0');
const dataIcs = (d) => `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}`;
const horaIcs = (min) => `${dois(Math.floor(min / 60))}${dois(min % 60)}00`;
const utcIcs = (d) =>
  `${d.getUTCFullYear()}${dois(d.getUTCMonth() + 1)}${dois(d.getUTCDate())}T${dois(d.getUTCHours())}${dois(d.getUTCMinutes())}${dois(d.getUTCSeconds())}Z`;

/** Escapa texto do iCalendar: barra, ponto-e-vírgula, vírgula e quebras de linha. */
export function escaparTexto(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Dobra a linha em pedaços de até 75 octetos (UTF-8), sem cortar um caractere ao meio. */
export function dobrarLinha(linha) {
  const cod = new TextEncoder();
  const partes = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const n = cod.encode(ch).length;
    // A continuação começa com um espaço, que também conta nos 75.
    const limite = partes.length ? 74 : 75;
    if (bytes + n > limite) {
      partes.push(atual);
      atual = '';
      bytes = 0;
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

/** Hash curto e estável (FNV-1a 32 bits) para o UID: a mesma aula gera sempre o mesmo evento. */
function hash(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const uidDaAula = (a) => `${hash(`${a.disciplina}|${a.diaSemana}|${a.inicioMin}|${a.fimMin}|${a.valeDe ?? ''}`)}@ufac-plus`;

/** Primeiro dia a partir de `de` que cai no dia da semana da aula. */
function primeiroDia(de, diaSemana) {
  const d = soData(de);
  const atual = d.getDay() || 7;
  d.setDate(d.getDate() + ((diaSemana - atual + 7) % 7));
  return d;
}

/** Dias da repetição semanal (de `dia` até `ate`) que são feriado. */
function feriadosNaRepeticao(dia, ate) {
  const lista = [];
  for (const d = new Date(dia); d <= ate; d.setDate(d.getDate() + 7)) if (semAulaPorFeriado(d)) lista.push(new Date(d));
  return lista;
}

/** Fim do último dia em Rio Branco (UTC-5, sem horário de verão), em UTC, como pede o UNTIL. */
const fimDoDiaUtc = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23 + 5, 59, 59));

/**
 * Monta o .ics. Aula = { disciplina, diaSemana, inicioMin, fimMin, valeDe?, valeAte? }.
 * Devolve { texto, eventos, prazoPadrao } (prazoPadrao: alguma aula usou os 4 meses à frente).
 */
export function gerarIcs(aulas, agora = new Date()) {
  let prazoPadrao = false;
  const eventos = [];
  for (const a of aulas ?? []) {
    if (!a?.disciplina || !(a.diaSemana >= 1 && a.diaSemana <= 7) || !(a.fimMin > a.inicioMin)) continue;
    const de = deDataISO(a.valeDe) ?? soData(agora);
    let ate = deDataISO(a.valeAte);
    if (!ate) {
      prazoPadrao = true;
      ate = new Date(agora.getFullYear(), agora.getMonth() + MESES_PADRAO, agora.getDate());
    }
    const dia = primeiroDia(de, a.diaSemana);
    if (dia > ate) continue;
    eventos.push([
      'BEGIN:VEVENT',
      `UID:${uidDaAula(a)}`,
      `DTSTAMP:${utcIcs(agora)}`,
      `DTSTART;TZID=${FUSO}:${dataIcs(dia)}T${horaIcs(a.inicioMin)}`,
      `DTEND;TZID=${FUSO}:${dataIcs(dia)}T${horaIcs(a.fimMin)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DIAS_ICS[a.diaSemana - 1]};UNTIL=${utcIcs(fimDoDiaUtc(ate))}`,
      // Feriados (não pontos facultativos) saem da repetição, como na Início.
      ...feriadosNaRepeticao(dia, ate).map((d) => `EXDATE;TZID=${FUSO}:${dataIcs(d)}T${horaIcs(a.inicioMin)}`),
      `SUMMARY:${escaparTexto(a.disciplina)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    ]);
  }
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UFAC+//Horarios//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Aulas (UFAC+)',
    `X-WR-TIMEZONE:${FUSO}`,
    'BEGIN:VTIMEZONE',
    `TZID:${FUSO}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0500',
    'TZNAME:-05',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...eventos.flat(),
    'END:VCALENDAR',
  ];
  return { texto: linhas.map(dobrarLinha).join('\r\n') + '\r\n', eventos: eventos.length, prazoPadrao };
}
