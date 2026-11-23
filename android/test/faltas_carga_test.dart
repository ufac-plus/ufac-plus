// Faltas permitidas e frequência pela carga horária de cada disciplina. Referência real de Arthur:
// Direito tem 72 h e a 17ª falta reprova (o iPhone ainda usa 60 h).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/config.dart';
import 'package:ufac_no_bolso/data/academico.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';
import 'package:ufac_no_bolso/screens/aviso_faltas.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';

SituacaoFaltas? s(String faltas, int? carga) => situacaoFaltas(faltas, cargaHoraria: carga);

void main() {
  group('fórmula: faltas permitidas pela carga (referência: 72 h → 16)', () {
    test('carga × 16/72, para baixo', () {
      expect(faltasPermitidas(36), 8);
      expect(faltasPermitidas(54), 12);
      expect(faltasPermitidas(72), 16);
      expect(faltasPermitidas(90), 20);
      expect(faltasPermitidas(108), 24);
      expect(faltasPermitidas(60), 13);
    });
    test('aulas programadas: carga × 8/9', () {
      expect(aulasProgramadas(72), closeTo(64, 1e-9));
      expect(aulasProgramadas(36), closeTo(32, 1e-9));
      expect(aulasProgramadas(108), closeTo(96, 1e-9));
    });
  });

  group('limite e aviso', () {
    test('72 h (Direito): 16 ainda passa, a 17ª reprova; aviso a partir de 12', () {
      expect(s('0', 72)!.permitidas, 16);
      expect(s('11', 72)!.nivel, NivelFaltas.tranquilo);
      expect(s('12', 72)!.nivel, NivelFaltas.atencao);
      expect(s('16', 72)!.nivel, NivelFaltas.atencao);
      expect(s('17', 72)!.nivel, NivelFaltas.limite);
      expect(s('16', 72)!.estimado, isFalse);
      expect(s('16', 72)!.cargaHoraria, 72);
    });
    test('36 h: 8 permitidas; aviso a partir de 6', () {
      expect(s('0', 36)!.permitidas, 8);
      expect(s('5', 36)!.nivel, NivelFaltas.tranquilo);
      expect(s('6', 36)!.nivel, NivelFaltas.atencao);
      expect(s('8', 36)!.nivel, NivelFaltas.atencao);
      expect(s('9', 36)!.nivel, NivelFaltas.limite);
    });
    test('54 h: 12 permitidas; aviso a partir de 9', () {
      expect(s('12', 54)!.permitidas, 12);
      expect(s('8', 54)!.nivel, NivelFaltas.tranquilo);
      expect(s('9', 54)!.nivel, NivelFaltas.atencao);
      expect(s('12', 54)!.nivel, NivelFaltas.atencao);
      expect(s('13', 54)!.nivel, NivelFaltas.limite);
    });
    test('108 h: 24 permitidas', () {
      expect(s('24', 108)!.permitidas, 24);
      expect(s('24', 108)!.nivel, NivelFaltas.atencao);
      expect(s('25', 108)!.nivel, NivelFaltas.limite);
    });
    test('60 h: a última falta permitida não fica abaixo de 75%', () {
      expect(s('13', 60)!.permitidas, 13);
      expect(s('13', 60)!.frequencia, greaterThanOrEqualTo(75));
      expect(s('14', 60)!.nivel, NivelFaltas.limite);
      expect(s('14', 60)!.frequencia, lessThan(75));
    });
  });

  group('frequência em %', () {
    test('arredondada para baixo e coerente com o limite', () {
      expect(s('0', 72)!.frequencia, 100);
      expect(s('4', 72)!.frequencia, 93);
      expect(s('16', 72)!.frequencia, 75);
      expect(s('17', 72)!.frequencia, 73);
      expect(s('8', 36)!.frequencia, 75);
      expect(s('12', 54)!.frequencia, 75);
      expect(s('24', 108)!.frequencia, 75);
      expect(s('25', 108)!.frequencia, 73);
      expect(s('999', 72)!.frequencia, 0);
    });
    test('linha da tela Notas', () {
      expect(detalheFrequencia(s('0', 72)!), 'Frequência 100% · carga de 72 h · a 17ª falta reprova');
      expect(detalheFrequencia(s('4', 72)!), 'Frequência 93% · carga de 72 h · a 17ª falta reprova');
      expect(detalheFrequencia(s('3', 36)!), 'Frequência 90% · carga de 36 h · a 9ª falta reprova');
    });
  });

  group('sem carga horária', () {
    test('16 como estimativa e sem porcentagem', () {
      for (final carga in <int?>[null, 0, -5]) {
        final r = s('5', carga)!;
        expect(r.permitidas, limiteFaltas);
        expect(r.estimado, isTrue);
        expect(r.frequencia, isNull);
        expect(r.cargaHoraria, isNull);
      }
      expect(s('12', null)!.nivel, NivelFaltas.atencao);
      expect(s('17', null)!.nivel, NivelFaltas.limite);
      expect(detalheFrequencia(s('5', null)!), 'Estimativa: não consegui ler a carga horária desta disciplina.');
    });
    test('sem número de faltas não inventa aviso', () {
      expect(s('', 60), isNull);
      expect(s('–', 60), isNull);
      expect(s('-3', 60), isNull);
    });
  });

  test('percentual explícito continua valendo (floor(carga × percentual), base = carga)', () {
    final r = situacaoFaltas('15', cargaHoraria: 60, percentual: 0.25)!;
    expect(r.permitidas, 15);
    expect(r.frequencia, 75);
  });

  test('a carga da fixture da turma (60 h) dá 13 permitidas', () {
    final carga = lerCargaHoraria(File('fixtures/portal_turma.html').readAsStringSync());
    expect(carga, 60);
    expect(s('3', carga)!.permitidas, 13);
  });

  group('AvisoFaltas', () {
    Future<void> montar(WidgetTester tester, NotasDisciplina nota, {bool detalhe = false}) => tester.pumpWidget(
          MaterialApp(
            theme: AppTema.claro,
            home: Scaffold(body: AvisoFaltas(nota: nota, mostrarDetalhe: detalhe)),
          ),
        );

    testWidgets('usa o limite da carga e mostra a frequência na tela Notas', (tester) async {
      const nota = NotasDisciplina(disciplina: 'X', situacao: 'Matrícula', faltas: '6', cargaHoraria: 36);
      await montar(tester, nota, detalhe: true);
      expect(find.text('6 de 8 faltas · restam 2'), findsOneWidget);
      expect(find.text('Frequência 81% · carga de 36 h · a 9ª falta reprova'), findsOneWidget);
    });

    testWidgets('sem a carga: 16 como estimativa', (tester) async {
      const nota = NotasDisciplina(disciplina: 'X', situacao: 'Matrícula', faltas: '6');
      await montar(tester, nota, detalhe: true);
      expect(find.text('6 de 16 faltas permitidas'), findsOneWidget);
      expect(find.text('Estimativa: não consegui ler a carga horária desta disciplina.'), findsOneWidget);
    });

    testWidgets('na Início, só o selo, sem a linha de frequência', (tester) async {
      const nota = NotasDisciplina(disciplina: 'X', situacao: 'Matrícula', faltas: '9', cargaHoraria: 36);
      await montar(tester, nota);
      expect(find.text('9 faltas · passou do limite de 8'), findsOneWidget);
      expect(find.textContaining('Frequência'), findsNothing);
    });

    testWidgets('sem faltas informadas, nada aparece', (tester) async {
      const nota = NotasDisciplina(disciplina: 'X', situacao: 'Matrícula', cargaHoraria: 60);
      await montar(tester, nota, detalhe: true);
      expect(find.textContaining('falta'), findsNothing);
    });
  });
}
