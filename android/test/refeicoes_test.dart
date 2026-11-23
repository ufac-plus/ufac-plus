import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/config.dart';
import 'package:ufac_no_bolso/data/cardapio.dart';
import 'package:ufac_no_bolso/data/refeicoes.dart';

// Datas locais fictícias; textos de cardápio inventados só para o teste.
DateTime em(int dia, int h, [int m = 0]) => DateTime(2026, 11, dia, h, m);

const textos = {
  Refeicao.cafe: 'Café preto, Leite, Pão com manteiga.',
  Refeicao.almoco: 'Arroz, Feijão, Frango assado.',
  Refeicao.jantar: 'Sopa de legumes, Pão.',
};

void main() {
  group('proximaRefeicaoComDia', () {
    final casos = <(int, int, Refeicao, bool)>[
      (5, 0, Refeicao.cafe, false), // antes do café
      (7, 0, Refeicao.cafe, false), // café em andamento
      (8, 0, Refeicao.almoco, false), // entre café e almoço
      (10, 0, Refeicao.almoco, false),
      (14, 0, Refeicao.jantar, false), // entre almoço e jantar
      (15, 0, Refeicao.jantar, false),
      (19, 0, Refeicao.jantar, false), // jantar em andamento
      (19, 29, Refeicao.jantar, false), // último minuto do jantar
      (19, 30, Refeicao.cafe, true), // fim do jantar: café de amanhã
      (21, 0, Refeicao.cafe, true),
      (23, 59, Refeicao.cafe, true),
      (0, 0, Refeicao.cafe, false), // virou o dia: o café agora é de hoje
    ];
    for (final (h, m, refeicao, amanha) in casos) {
      test('${h}h$m → ${refeicao.nome} (amanhã: $amanha)', () {
        final p = proximaRefeicaoComDia(em(20, h, m));
        expect(p.refeicao, refeicao);
        expect(p.amanha, amanha);
        expect(proximaRefeicao(em(20, h, m)), refeicao);
      });
    }
  });

  group('aba do RU ao abrir', () {
    test('segue a próxima refeição durante o dia', () {
      expect(refeicaoAoAbrirRu(em(20, 5)), Refeicao.cafe);
      expect(refeicaoAoAbrirRu(em(20, 9)), Refeicao.almoco);
      expect(refeicaoAoAbrirRu(em(20, 19, 29)), Refeicao.jantar);
    });
    test('depois do jantar fica no jantar, e volta ao café na meia-noite', () {
      expect(refeicaoAoAbrirRu(em(20, 19, 30)), Refeicao.jantar);
      expect(refeicaoAoAbrirRu(em(20, 23, 59)), Refeicao.jantar);
      expect(refeicaoAoAbrirRu(em(21, 0, 0)), Refeicao.cafe);
    });
    test('refeições de hoje encerradas só entre 19h30 e a meia-noite', () {
      expect(refeicoesDeHojeEncerradas(em(20, 19, 29)), isFalse);
      expect(refeicoesDeHojeEncerradas(em(20, 19, 30)), isTrue);
      expect(refeicoesDeHojeEncerradas(em(21, 0, 0)), isFalse);
    });
  });

  group('cardápio na Início', () {
    final lidoHoje = CardapioDoDia(em(20, 6), textos);

    test('entre refeições mostra o cardápio lido hoje', () {
      final agora = em(20, 9);
      expect(itensDaProximaRefeicao(lidoHoje, proximaRefeicaoComDia(agora), agora), ['Arroz', 'Feijão', 'Frango assado']);
    });

    test('19h29 ainda mostra o jantar de hoje', () {
      final agora = em(20, 19, 29);
      expect(itensDaProximaRefeicao(lidoHoje, proximaRefeicaoComDia(agora), agora), ['Sopa de legumes', 'Pão']);
    });

    test('depois do jantar nunca mostra o café lido hoje como o de amanhã', () {
      for (final agora in [em(20, 19, 30), em(20, 23, 59)]) {
        final p = proximaRefeicaoComDia(agora);
        expect(itensDaProximaRefeicao(lidoHoje, p, agora), isEmpty);
        expect(fraseCardapioNaoSaiu(p), 'O cardápio do café de amanhã ainda não saiu');
      }
    });

    test('virada da meia-noite: cardápio de ontem não vale para o café de hoje', () {
      final agora = em(21, 0, 1);
      final p = proximaRefeicaoComDia(agora);
      expect(p.amanha, isFalse);
      expect(itensDaProximaRefeicao(lidoHoje, p, agora), isEmpty);
      expect(fraseCardapioNaoSaiu(p), 'O cardápio do café ainda não saiu');
      expect(cardapioPendente(lidoHoje, agora), isTrue);
    });

    test('sem cardápio lido, a lista fica vazia', () {
      final agora = em(20, 9);
      expect(itensDaProximaRefeicao(null, proximaRefeicaoComDia(agora), agora), isEmpty);
    });
  });
}
