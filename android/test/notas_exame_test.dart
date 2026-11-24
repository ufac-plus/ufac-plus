// "Quanto preciso no exame" (issue #23, seção 2) e frequência em porcentagem (issue #13).
// Regimento Geral da Ufac (Res. CONSU 33/2011, alterada pelas 43/2011 e 50/2013), arts. 314, 316, 317, 319 e 320.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/academico.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';

String fixture(String nome) => File('fixtures/$nome').readAsStringSync();

/// Disciplina no formato do extrator (lerNotasDaDisciplina).
NotasDisciplina disciplina({
  String n1 = '6,00',
  String n2 = '5,00',
  String media = '5,50',
  String exame = '',
  String mediaFinal = '',
  String mf = '',
  String faltas = '4',
  int? carga = 60,
}) => NotasDisciplina(
  disciplina: 'Disciplina Exemplo',
  situacao: 'Matrícula',
  notas: [
    NotaAvaliacao('Nota 1', '50.00%', [ItemNota('Total', '100%', n1)]),
    NotaAvaliacao('Nota 2', '50.00%', [ItemNota('Total', '100%', n2)]),
  ],
  resumo: [ItemNota('Média', '', media), ItemNota('Exame', '', exame), ItemNota('Média Final', '', mediaFinal)],
  media: mf,
  faltas: faltas,
  cargaHoraria: carga,
);

void main() {
  group('frequência em porcentagem (issue #13)', () {
    SituacaoFaltas s(String f, int? carga) => situacaoFaltas(f, cargaHoraria: carga, permitidasSemCarga: 16)!;
    test('base: aulas programadas da carga (carga × 16/15), para baixo', () {
      expect(s('0', 60).frequencia, 100);
      expect(s('4', 60).frequencia, 93);
      expect(s('16', 60).frequencia, 75);
      expect(s('17', 60).frequencia, 73);
      expect(s('8', 30).frequencia, 75);
      expect(s('12', 45).frequencia, 75);
      expect(s('24', 90).frequencia, 75);
      expect(s('25', 90).frequencia, lessThan(75));
      expect(s('10', 40).frequencia, greaterThanOrEqualTo(75));
      expect(s('11', 40).frequencia, lessThan(75));
    });
    test('nunca negativa; sem a carga não existe', () {
      expect(s('200', 30).frequencia, 0);
      expect(s('4', null).frequencia, isNull);
      expect(s('4', 60).cargaHoraria, 60);
    });
    test('aulas programadas', () {
      expect(aulasProgramadas(60), 64);
      expect(aulasProgramadas(30), 32);
    });
  });

  group('lerNumero', () {
    test('vírgula ou ponto, com espaços', () {
      expect(lerNumero('6,50'), 6.5);
      expect(lerNumero('6.5'), 6.5);
      expect(lerNumero(' 7 '), 7);
      expect(lerNumero('0,0'), 0);
      expect(lerNumero(8), 8);
    });
    test('vazio, traço ou texto não viram número', () {
      for (final v in ['', '—', '-', '–', null, 'abc', '7,5a', '1,2,3']) {
        expect(lerNumero(v), isNull, reason: '$v');
      }
    });
  });

  group('notaNecessariaNoExame: EF = 10 − MP, para MF 5', () {
    test('MP 3,5 precisa de 6,5', () => expect(notaNecessariaNoExame(3.5), 6.5));
    test('arredonda para cima na primeira casa, para nunca faltar', () {
      expect(notaNecessariaNoExame(6.75), 3.3);
      expect(notaNecessariaNoExame(7.99), 2.1);
      expect(notaNecessariaNoExame(5), 5);
    });
    test('MP 8 ou mais passa sem exame; MP zero não tem exame (arts. 316 e 317)', () {
      expect(notaNecessariaNoExame(8), isNull);
      expect(notaNecessariaNoExame(9.5), isNull);
      expect(notaNecessariaNoExame(0), isNull);
      expect(notaNecessariaNoExame(null), isNull);
      expect(notaNecessariaNoExame(-1), isNull);
    });
  });

  group('exameDaDisciplina', () {
    ExameNecessario? e(NotasDisciplina? d, {bool atual = true}) => exameDaDisciplina(d, atual: atual);
    test('semestre atual, média parcial abaixo de 8 e sem exame lançado', () {
      final r = e(disciplina())!;
      expect(r.mediaParcial, 5.5);
      expect(r.necessaria, 4.5);
    });
    test('aceita a média com ponto', () => expect(e(disciplina(media: '3.5'))!.necessaria, 6.5));
    test('semestre encerrado não mostra nada', () => expect(e(disciplina(), atual: false), isNull));
    test('média vazia, com traço, zero ou de 8 para cima: nada', () {
      for (final media in ['', '—', '0,00', '8,00', '9,1']) {
        expect(e(disciplina(media: media)), isNull, reason: media);
      }
    });
    test('com uma das notas ainda sem lançar: nada', () {
      expect(e(disciplina(n2: '')), isNull);
      expect(e(disciplina(n2: '—')), isNull);
    });
    test('exame ou média final já no portal: vale o que o portal diz', () {
      expect(e(disciplina(exame: '6,0')), isNull);
      expect(e(disciplina(mediaFinal: '5,8')), isNull);
      expect(e(disciplina(mf: '5,8')), isNull);
    });
    test('passou do limite de faltas: não tem direito ao exame (art. 317)', () {
      expect(e(disciplina(faltas: '17')), isNull);
      expect(e(disciplina(faltas: '16')), isNotNull);
    });
    test('sem a carga horária, o limite é estimativa: só com 0 faltas', () {
      expect(e(disciplina(faltas: '10', carga: null)), isNull);
      expect(e(disciplina(faltas: '1', carga: null)), isNull);
      expect(e(disciplina(faltas: '0', carga: null)), isNotNull);
      expect(e(disciplina(faltas: '8', carga: 30)), isNotNull);
      expect(e(disciplina(faltas: '9', carga: 30)), isNull);
    });
    test('sem quadro de notas: nada', () {
      expect(e(const NotasDisciplina(disciplina: 'X', situacao: 'Matrícula', faltas: '0')), isNull);
      expect(e(null), isNull);
    });
  });

  test('formatarNota usa vírgula', () {
    expect(formatarNota(6.5), '6,5');
    expect(formatarNota(7, 2), '7,00');
    expect(formatarNota(7.8333, 2), '7,83');
  });

  test('fixture: média parcial 3,50 e exame em branco pede 6,5; a de sempre (média 8) não pede', () {
    const d = DisciplinaDoSemestre('Outra Disciplina', 'Matrícula', null);
    final n = lerNotasDaDisciplina(fixture('portal_notaturma_exame_ajax.html'), d).comCargaHoraria(60);
    final r = exameDaDisciplina(n, atual: true)!;
    expect(r.mediaParcial, 3.5);
    expect(r.necessaria, 6.5);
    expect(exameDaDisciplina(lerNotasDaDisciplina(fixture('portal_notaturma_ajax.html'), d), atual: true), isNull);
  });
}
