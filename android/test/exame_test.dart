// "Quanto preciso no exame" (Regimento Geral da Ufac, arts. 316, 317, 319 e 320).
// Porte de iphone/web/test/notas_exame_media.test.js.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/academico.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';

/// Disciplina no formato do extrator (lerNotasDaDisciplina).
NotasDisciplina disciplina({
  String n1 = '6,00',
  String n2 = '5,00',
  String media = '5,50',
  String exame = '',
  String finalResumo = '',
  String mf = '',
  String faltas = '4',
  int? carga = 72,
}) =>
    NotasDisciplina(
      disciplina: 'Disciplina Exemplo',
      situacao: 'Matrícula',
      notas: [
        NotaAvaliacao('Nota 1', '50.00%', [ItemNota('Total', '100%', n1)]),
        NotaAvaliacao('Nota 2', '50.00%', [ItemNota('Total', '100%', n2)]),
      ],
      resumo: [
        ItemNota('Média', '', media),
        ItemNota('Exame', '', exame),
        ItemNota('Média Final', '', finalResumo),
      ],
      media: mf,
      faltas: faltas,
      cargaHoraria: carga,
    );

void main() {
  group('lerNumero', () {
    test('vírgula ou ponto, com espaços', () {
      expect(lerNumero('6,50'), 6.5);
      expect(lerNumero('6.5'), 6.5);
      expect(lerNumero(' 7 '), 7);
      expect(lerNumero('0,0'), 0);
    });
    test('vazio, traço ou texto não viram número', () {
      for (final v in ['', '—', '-', '–', null, 'abc', '7,5a', '1,2,3']) {
        expect(lerNumero(v), isNull, reason: '$v');
      }
    });
  });

  group('notaNecessariaNoExame: EF = 10 − MP, para MF 5', () {
    test('MP 3,5 precisa de 6,5', () => expect(notaNecessariaNoExame(3.5), 6.5));
    test('arredonda para cima na primeira casa (art. 305), para nunca faltar', () {
      expect(notaNecessariaNoExame(6.75), 3.3);
      expect(notaNecessariaNoExame(7.99), 2.1);
      expect(notaNecessariaNoExame(5), 5);
    });
    test('MP 8 ou mais passa sem exame; MP zero não tem direito ao exame (arts. 316 e 317)', () {
      expect(notaNecessariaNoExame(8), isNull);
      expect(notaNecessariaNoExame(9.5), isNull);
      expect(notaNecessariaNoExame(0), isNull);
      expect(notaNecessariaNoExame(null), isNull);
      expect(notaNecessariaNoExame(-1), isNull);
    });
  });

  group('exameDaDisciplina', () {
    test('semestre atual, média parcial abaixo de 8 e sem exame lançado', () {
      final e = exameDaDisciplina(disciplina(), atual: true)!;
      expect(e.mediaParcial, 5.5);
      expect(e.necessaria, 4.5);
    });
    test('aceita a média com ponto', () {
      final e = exameDaDisciplina(disciplina(media: '3.5'), atual: true)!;
      expect(e.mediaParcial, 3.5);
      expect(e.necessaria, 6.5);
    });
    test('semestre encerrado não mostra nada', () {
      expect(exameDaDisciplina(disciplina(), atual: false), isNull);
    });
    test('média vazia, com traço, zero ou de 8 para cima: nada', () {
      for (final media in ['', '—', '0,00', '8,00', '9,1']) {
        expect(exameDaDisciplina(disciplina(media: media), atual: true), isNull, reason: media);
      }
    });
    test('com uma das notas ainda sem lançar, a média parcial não é a final: nada', () {
      expect(exameDaDisciplina(disciplina(n2: ''), atual: true), isNull);
      expect(exameDaDisciplina(disciplina(n2: '—'), atual: true), isNull);
    });
    test('exame ou média final já no portal: vale o que o portal diz', () {
      expect(exameDaDisciplina(disciplina(exame: '6,0'), atual: true), isNull);
      expect(exameDaDisciplina(disciplina(finalResumo: '5,8'), atual: true), isNull);
      expect(exameDaDisciplina(disciplina(mf: '5,8'), atual: true), isNull);
    });
    test('passou do limite de faltas: não tem direito ao exame (art. 317)', () {
      expect(exameDaDisciplina(disciplina(faltas: '17'), atual: true), isNull);
      expect(exameDaDisciplina(disciplina(faltas: '16'), atual: true), isNotNull);
    });
    test('sem a carga horária, o limite de faltas é estimativa: com faltas, nada (numa de 36 h já teria passado)', () {
      expect(exameDaDisciplina(disciplina(faltas: '10', carga: null), atual: true), isNull);
      expect(exameDaDisciplina(disciplina(faltas: '1', carga: null), atual: true), isNull);
      expect(exameDaDisciplina(disciplina(faltas: '0', carga: null), atual: true), isNotNull);
      expect(exameDaDisciplina(disciplina(faltas: '8', carga: 36), atual: true), isNotNull);
      expect(exameDaDisciplina(disciplina(faltas: '9', carga: 36), atual: true), isNull);
    });
    test('sem quadro de notas: nada', () {
      final d = disciplina();
      final vazia = NotasDisciplina(
        disciplina: d.disciplina,
        situacao: d.situacao,
        faltas: d.faltas,
        cargaHoraria: d.cargaHoraria,
      );
      expect(exameDaDisciplina(vazia, atual: true), isNull);
      expect(exameDaDisciplina(null, atual: true), isNull);
    });
  });

  test('formatarNota usa vírgula', () {
    expect(formatarNota(6.5), '6,5');
    expect(formatarNota(7, 2), '7,00');
    expect(formatarNota(7.8333, 2), '7,83');
  });

  test('fixture: quadro com média parcial 3,50 e exame em branco pede 6,5', () {
    String fixture(String nome) => File('fixtures/$nome').readAsStringSync();
    final d = lerNotasDaDisciplina(
      fixture('portal_notaturma_exame_ajax.html'),
      const DisciplinaDoSemestre('Outra Disciplina', 'Matrícula', null),
    ).comCargaHoraria(72);
    final e = exameDaDisciplina(d, atual: true)!;
    expect(e.mediaParcial, 3.5);
    expect(e.necessaria, 6.5);
    // A fixture de sempre (média 8,00, aprovado) não pede exame.
    final aprovado = lerNotasDaDisciplina(
      fixture('portal_notaturma_ajax.html'),
      const DisciplinaDoSemestre('X', 'Matrícula', null),
    );
    expect(exameDaDisciplina(aprovado, atual: true), isNull);
  });
}
