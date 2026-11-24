// Arquivo .ics (iCalendar, RFC 5545) com as aulas da semana, gerado no próprio celular.
// Nada sai do aparelho: o Android entrega o arquivo à agenda que a pessoa escolher.
// Mesma regra da versão do iPhone (iphone/web/src/lib/dominio/agenda.js), inclusive o UID.
import 'dart:convert';

import 'academico.dart';
import 'feriados.dart';

const fusoAgenda = 'America/Rio_Branco';
const _diasIcs = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']; // diaSemana 1..7 (segunda..domingo)
const _mesesPadrao = 4; // sem o fim do período no portal, repete por 4 meses

class ResultadoIcs {
  const ResultadoIcs(this.texto, this.eventos, this.prazoPadrao);

  final String texto;
  final int eventos;

  /// Alguma aula usou os 4 meses à frente, porque o portal não informou o fim do período.
  final bool prazoPadrao;
}

String _dois(int n) => n.toString().padLeft(2, '0');
String _data(DateTime d) => '${d.year}${_dois(d.month)}${_dois(d.day)}';
String _hora(int min) => '${_dois(min ~/ 60)}${_dois(min % 60)}00';
String _utc(DateTime d) {
  final u = d.toUtc();
  return '${_data(u)}T${_dois(u.hour)}${_dois(u.minute)}${_dois(u.second)}Z';
}

String _iso(DateTime d) => '${d.year}-${_dois(d.month)}-${_dois(d.day)}';
DateTime _soData(DateTime d) => DateTime(d.year, d.month, d.day);

/// Escapa texto do iCalendar: barra, ponto-e-vírgula, vírgula e quebras de linha.
String escaparTextoIcs(String s) =>
    s.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll(RegExp(r'\r?\n'), '\\n');

/// Dobra a linha em pedaços de até 75 octetos (UTF-8), sem cortar um caractere ao meio.
String dobrarLinhaIcs(String linha) {
  final partes = <String>[];
  final atual = StringBuffer();
  var bytes = 0;
  for (final ch in linha.runes.map(String.fromCharCode)) {
    final n = utf8.encode(ch).length;
    // A continuação começa com um espaço, que também conta nos 75.
    final limite = partes.isEmpty ? 75 : 74;
    if (bytes + n > limite) {
      partes.add(atual.toString());
      atual.clear();
      bytes = 0;
    }
    atual.write(ch);
    bytes += n;
  }
  partes.add(atual.toString());
  return partes.join('\r\n ');
}

/// Hash curto e estável (FNV-1a 32 bits) para o UID: a mesma aula gera sempre o mesmo evento.
String _hash(String s) {
  var h = 0x811c9dc5;
  for (final b in utf8.encode(s)) {
    h ^= b;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

String uidDaAula(Aula a) {
  final de = a.valeDe == null ? '' : _iso(a.valeDe!);
  return '${_hash('${a.disciplina}|${a.diaSemana}|${a.inicioMin}|${a.fimMin}|$de')}@ufac-plus';
}

/// Primeiro dia a partir de `de` que cai no dia da semana da aula.
DateTime _primeiroDia(DateTime de, int diaSemana) {
  final d = _soData(de);
  return DateTime(d.year, d.month, d.day + (diaSemana - d.weekday + 7) % 7);
}

/// Dias da repetição semanal (de `dia` até `ate`) que são feriado.
List<DateTime> _feriadosNaRepeticao(DateTime dia, DateTime ate) => [
  for (var d = dia; !d.isAfter(ate); d = DateTime(d.year, d.month, d.day + 7))
    if (semAulaPorFeriado(d)) d,
];

/// Fim do último dia em Rio Branco (UTC-5, sem horário de verão), em UTC, como pede o UNTIL.
DateTime _fimDoDiaUtc(DateTime d) => DateTime.utc(d.year, d.month, d.day, 23 + 5, 59, 59);

/// Monta o .ics com uma repetição semanal por aula, sem as datas de feriado.
ResultadoIcs gerarIcs(List<Aula> aulas, [DateTime? agora]) {
  final hoje = agora ?? DateTime.now();
  var prazoPadrao = false;
  final eventos = <List<String>>[];
  for (final a in aulas) {
    if (a.disciplina.isEmpty || a.diaSemana < 1 || a.diaSemana > 7 || a.fimMin <= a.inicioMin) continue;
    final de = a.valeDe ?? _soData(hoje);
    var ate = a.valeAte;
    if (ate == null) {
      prazoPadrao = true;
      ate = DateTime(hoje.year, hoje.month + _mesesPadrao, hoje.day);
    }
    final dia = _primeiroDia(de, a.diaSemana);
    if (dia.isAfter(ate)) continue;
    eventos.add([
      'BEGIN:VEVENT',
      'UID:${uidDaAula(a)}',
      'DTSTAMP:${_utc(hoje)}',
      'DTSTART;TZID=$fusoAgenda:${_data(dia)}T${_hora(a.inicioMin)}',
      'DTEND;TZID=$fusoAgenda:${_data(dia)}T${_hora(a.fimMin)}',
      'RRULE:FREQ=WEEKLY;BYDAY=${_diasIcs[a.diaSemana - 1]};UNTIL=${_utc(_fimDoDiaUtc(ate))}',
      // Feriados (não pontos facultativos) saem da repetição, como na Início.
      for (final d in _feriadosNaRepeticao(dia, ate)) 'EXDATE;TZID=$fusoAgenda:${_data(d)}T${_hora(a.inicioMin)}',
      'SUMMARY:${escaparTextoIcs(a.disciplina)}',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    ]);
  }
  final linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UFAC+//Horarios//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Aulas (UFAC+)',
    'X-WR-TIMEZONE:$fusoAgenda',
    'BEGIN:VTIMEZONE',
    'TZID:$fusoAgenda',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0500',
    'TZNAME:-05',
    'END:STANDARD',
    'END:VTIMEZONE',
    for (final e in eventos) ...e,
    'END:VCALENDAR',
  ];
  return ResultadoIcs('${linhas.map(dobrarLinhaIcs).join('\r\n')}\r\n', eventos.length, prazoPadrao);
}
