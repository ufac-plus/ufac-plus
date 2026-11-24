import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/historico.dart';
import 'package:ufac_no_bolso/data/repositorio_ru.dart';
import 'package:ufac_no_bolso/extractors/eticket_historico.dart';
import 'package:ufac_no_bolso/screens/historico.dart';
import 'package:ufac_no_bolso/session/sessao.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';
import 'package:ufac_no_bolso/ui/formatos.dart';

RegistroRefeicao _refeicao(String data, double? valor) =>
    RegistroRefeicao(data: data, hora: '11:30', refeicao: 'Almoço', prato: '', valor: valor, status: '');

RegistroRecarga _recarga(String data, double? valor) =>
    RegistroRecarga(valor: valor, forma: 'PIX', data: data, hora: '10:20', situacao: '');

void main() {
  test('lerDataEticket aceita dd/mm/aaaa e recusa o resto', () {
    expect(lerDataEticket('01/10/2026'), DateTime(2026, 10, 1));
    expect(lerDataEticket(' 31/12/2025 '), DateTime(2025, 12, 31));
    expect(lerDataEticket(''), isNull);
    expect(lerDataEticket('2026-10-01'), isNull);
    expect(lerDataEticket('32/13/2026'), isNull);
  });

  test('gastosPorMes soma refeicoes e recargas de cada mes, do mais recente ao mais antigo', () {
    final h = HistoricoRu(
      lidoEm: DateTime(2026, 11, 23),
      refeicoes: [
        _refeicao('03/11/2026', 1.0),
        _refeicao('04/11/2026', 1.0),
        _refeicao('30/10/2026', 1.5),
        _refeicao('sem data', 9.0),
      ],
      recargas: [_recarga('01/11/2026', 10.0), _recarga('02/09/2026', 5.0), _recarga('05/11/2026', null)],
    );
    final meses = gastosPorMes(h);
    expect(meses.map((m) => '${m.mes}/${m.ano}'), ['11/2026', '10/2026', '9/2026']);
    expect(meses[0].refeicoes, 2);
    expect(meses[0].gastoRefeicoes, 2.0);
    expect(meses[0].recargas, 2);
    expect(meses[0].recarregado, 10.0);
    expect(meses[1].refeicoes, 1);
    expect(meses[1].gastoRefeicoes, 1.5);
    expect(meses[1].recargas, 0);
    expect(meses[2].refeicoes, 0);
    expect(meses[2].recarregado, 5.0);
  });

  test('gastosPorMes de quem nunca usou o RU fica vazio', () {
    expect(gastosPorMes(HistoricoRu(lidoEm: DateTime(2026, 11, 23), refeicoes: const [], recargas: const [])), isEmpty);
  });

  test('gastosPorMes com as fixtures do eTICKET', () {
    String fixture(String nome) => File('fixtures/$nome').readAsStringSync();
    final h = HistoricoRu(
      lidoEm: DateTime(2026, 11, 23),
      refeicoes: lerHistoricoRefeicoes(fixture('eticket_refeicoes.html'))!,
      recargas: lerHistoricoRecargas(fixture('eticket_historico.html'))!,
    );
    final meses = gastosPorMes(h);
    expect(meses.first.mes, 10);
    expect(meses.first.gastoRefeicoes, 2.0);
    expect(meses.first.recarregado, 5.0);
    expect(meses.last.mes, 9);
  });

  test('formatarMesAno', () {
    expect(formatarMesAno(DateTime(2026, 11)), 'Novembro de 2026');
    expect(formatarMesAno(DateTime(2026, 3)), 'Março de 2026');
  });

  testWidgets('aba Gastos mostra o resumo de cada mes', (tester) async {
    Sessao.instancia.leitor = (_, _) async => const PaginaLida(ResultadoVerificacao.semResposta);
    RepositorioRu.instancia.historico = HistoricoRu(
      lidoEm: DateTime(2026, 11, 23),
      refeicoes: [_refeicao('03/11/2026', 1.0), _refeicao('04/11/2026', 1.0), _refeicao('30/10/2026', 1.0)],
      recargas: [_recarga('01/11/2026', 10.0)],
    );
    await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: const TelaHistorico()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gastos'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Novembro de 2026'), findsOneWidget);
    expect(find.text('R\$ 2,00'), findsOneWidget);
    expect(find.text('2 refeições'), findsOneWidget);
    expect(find.text('R\$ 10,00 em 1 recarga'), findsOneWidget);
    expect(find.text('Outubro de 2026'), findsOneWidget);
    expect(find.text('1 refeição'), findsOneWidget);
    expect(find.text('Nenhuma recarga'), findsOneWidget);
  });

  testWidgets('aba Gastos vazia', (tester) async {
    Sessao.instancia.leitor = (_, _) async => const PaginaLida(ResultadoVerificacao.semResposta);
    RepositorioRu.instancia.historico = HistoricoRu(
      lidoEm: DateTime(2026, 11, 23),
      refeicoes: const [],
      recargas: const [],
    );
    await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: const TelaHistorico()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gastos'));
    await tester.pumpAndSettle();
    expect(find.text('Nenhum gasto ainda'), findsOneWidget);
  });
}
