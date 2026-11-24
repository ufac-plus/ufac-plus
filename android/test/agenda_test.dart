import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/academico.dart';
import 'package:ufac_no_bolso/data/agenda.dart';

// Dados fictícios, os mesmos do teste do iPhone (iphone/web/test/agenda.test.js).
final agora = DateTime(2026, 11, 21, 10); // sábado, 21/11/2026
final aula = Aula(
  disciplina: 'Direito Civil VI',
  diaSemana: 3,
  inicioMin: 19 * 60,
  fimMin: 20 * 60 + 40,
  valeDe: DateTime(2026, 8, 10),
  valeAte: DateTime(2026, 12, 18),
);

void main() {
  group('agenda (.ics)', () {
    test('escapa vírgula, ponto-e-vírgula, barra e quebra de linha', () {
      expect(escaparTextoIcs('A, B; C\\D\nE'), 'A\\, B\\; C\\\\D\\nE');
    });

    test('usa CRLF e termina com CRLF', () {
      final texto = gerarIcs([aula], agora).texto;
      expect(texto.endsWith('\r\n'), isTrue);
      expect(texto.replaceAll('\r\n', ''), isNot(matches(RegExp(r'[\r\n]'))));
    });

    test('dobra linhas em 75 octetos sem cortar acentos', () {
      final longa = 'SUMMARY:${'ção' * 40}';
      final partes = dobrarLinhaIcs(longa).split('\r\n');
      expect(partes.length, greaterThan(1));
      for (final p in partes) {
        expect(utf8.encode(p).length, lessThanOrEqualTo(75));
      }
      for (final p in partes.skip(1)) {
        expect(p.startsWith(' '), isTrue);
      }
      expect([for (var i = 0; i < partes.length; i++) i == 0 ? partes[i] : partes[i].substring(1)].join(), longa);
      expect(dobrarLinhaIcs('curta'), 'curta');
    });

    test('UID estável, diferente para outra aula e igual ao do iPhone', () {
      expect(uidDaAula(aula), uidDaAula(aula));
      final outra = Aula(disciplina: aula.disciplina, diaSemana: 4, inicioMin: aula.inicioMin, fimMin: aula.fimMin);
      expect(uidDaAula(aula), isNot(uidDaAula(outra)));
      // Mesmo hash da versão do iPhone: importar pelos dois aparelhos não duplica as aulas.
      expect(uidDaAula(aula), '70e747a2@ufac-plus');
      expect(
        uidDaAula(const Aula(disciplina: 'Teste, Um', diaSemana: 1, inicioMin: 480, fimMin: 600)),
        'e8e6024d@ufac-plus',
      );
      String uid(String t) => RegExp(r'UID:(.+)').firstMatch(t)!.group(1)!;
      expect(uid(gerarIcs([aula], agora).texto), uid(gerarIcs([aula], DateTime(2026, 12, 1)).texto));
    });

    test('gera evento semanal com fuso de Rio Branco e fim do período', () {
      final r = gerarIcs([aula], agora);
      expect(r.eventos, 1);
      expect(r.prazoPadrao, isFalse);
      expect(r.texto, contains('BEGIN:VTIMEZONE\r\nTZID:America/Rio_Branco'));
      expect(r.texto, contains('TZOFFSETTO:-0500'));
      // 10/08/2026 é segunda; a primeira quarta é 12/08.
      expect(r.texto, contains('DTSTART;TZID=America/Rio_Branco:20260812T190000'));
      expect(r.texto, contains('DTEND;TZID=America/Rio_Branco:20260812T204000'));
      // 18/12 23:59:59 em UTC-5 = 19/12 04:59:59Z.
      expect(r.texto, contains('RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261219T045959Z'));
      expect(r.texto, contains('SUMMARY:Direito Civil VI'));
      expect(r.texto, isNot(contains('LOCATION')));
    });

    test('sem fim do período, repete por 4 meses e avisa', () {
      final r = gerarIcs([const Aula(disciplina: 'Teste, Um', diaSemana: 1, inicioMin: 480, fimMin: 600)], agora);
      expect(r.prazoPadrao, isTrue);
      expect(r.texto, contains('DTSTART;TZID=America/Rio_Branco:20261123T080000'));
      expect(r.texto, contains('UNTIL=20270322T045959Z'));
      expect(r.texto, contains('SUMMARY:Teste\\, Um'));
    });

    test('ignora aula inválida e domingo vira SU', () {
      final domingo = Aula(
        disciplina: aula.disciplina,
        diaSemana: 7,
        inicioMin: aula.inicioMin,
        fimMin: aula.fimMin,
        valeDe: aula.valeDe,
        valeAte: aula.valeAte,
      );
      final r = gerarIcs([const Aula(disciplina: '', diaSemana: 1, inicioMin: 1, fimMin: 2), domingo], agora);
      expect(r.eventos, 1);
      expect(r.texto, contains('BYDAY=SU'));
    });

    test('sem aulas, nenhum evento', () {
      expect(gerarIcs(const [], agora).eventos, 0);
    });
  });

  group('feriados no .ics', () {
    test('tira da repetição a aula que cai em feriado', () {
      // Segunda, 2/11/2026 é Finados; 9/11 não é feriado.
      final r = gerarIcs([
        Aula(
          disciplina: 'Teste',
          diaSemana: 1,
          inicioMin: 8 * 60,
          fimMin: 10 * 60,
          valeDe: DateTime(2026, 10, 26),
          valeAte: DateTime(2026, 11, 16),
        ),
      ], DateTime(2026, 10, 20));
      expect(r.texto, contains('EXDATE;TZID=America/Rio_Branco:20261102T080000'));
      expect(r.texto, isNot(contains('EXDATE;TZID=America/Rio_Branco:20261109')));
    });

    test('ponto facultativo não sai da repetição', () {
      // Corpus Christi 2026 é quinta, 4/6 (ponto facultativo).
      final r = gerarIcs([
        Aula(
          disciplina: 'Teste',
          diaSemana: 4,
          inicioMin: 8 * 60,
          fimMin: 10 * 60,
          valeDe: DateTime(2026, 6, 1),
          valeAte: DateTime(2026, 6, 12),
        ),
      ], DateTime(2026, 5, 20));
      expect(r.texto, isNot(contains('EXDATE')));
    });
  });
}
