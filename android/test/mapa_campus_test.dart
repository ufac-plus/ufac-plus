// Mapa do campus feito pelo app, com a lista pública de prédios da Ufac.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/banco.dart';
import 'package:ufac_no_bolso/data/mapa_campus.dart';
import 'package:ufac_no_bolso/screens/mapa_campus.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';

String fixture() => File('fixtures/public/mapa_locais.json').readAsStringSync();

void main() {
  setUp(() => Banco.memoria = {});

  test('lê os prédios e deixa de fora quem não tem coordenada', () {
    final l = lerLocaisCampus(fixture())!;
    expect(l, hasLength(2));
    final a05 = l.first;
    expect(a05.codigo, 'A05');
    expect(a05.titulo, 'Almoxarifado');
    expect(a05.setor, 'Setor A');
    expect(a05.horario, '07:00 às 22:00');
    expect(a05.categoria, 'Administrativo');
    expect(a05.descricao, isNull, reason: '"ALMOXARIFADO." só repete o título');
    expect(a05.acessibilidade, ['Rampa', 'Banheiro PcD', 'Piso tátil']);
    expect(a05.latitude, closeTo(-9.9575, 0.001));
    expect(lerLocaisCampus('<html>erro</html>'), isNull);
  });

  test('busca sem acento, por nome, código ou tipo', () {
    final l = lerLocaisCampus(fixture())!;
    expect(l.where((x) => x.combina('almox')).single.codigo, 'A05');
    expect(l.where((x) => x.combina('r02')).single.codigo, 'R02');
    expect(l.where((x) => x.combina('convivencia')).single.codigo, 'R02');
  });

  test('guarda por 7 dias e, se a Ufac não responder, usa o que tem salvo', () async {
    var pedidos = 0;
    String? resposta = fixture();
    final repo = RepositorioMapaCampus(buscar: () async {
      pedidos++;
      return resposta;
    });
    expect(await repo.locais(), hasLength(2));
    expect(await repo.locais(), hasLength(2));
    expect(pedidos, 1, reason: 'a segunda vez vem do celular');
    resposta = null;
    expect(await repo.locais(forcar: true), hasLength(2), reason: 'servidor fora: mostra o salvo');
    expect(pedidos, 2);
  });

  testWidgets('tela: busca um prédio e abre a ficha', (tester) async {
    TelaMapaCampus.mostrarFundo = false;
    addTearDown(() => TelaMapaCampus.mostrarFundo = true);
    final repo = RepositorioMapaCampus(buscar: () async => fixture());
    await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: TelaMapaCampus(repositorio: repo)));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
    expect(find.text('A05'), findsOneWidget, reason: 'marcador no mapa');
    await tester.enterText(find.byType(TextField), 'almox');
    await tester.pump();
    expect(find.text('Almoxarifado'), findsOneWidget);
    await tester.tap(find.text('Almoxarifado'));
    await tester.pumpAndSettle();
    expect(find.text('Como chegar'), findsOneWidget);
    expect(find.text('07:00 às 22:00'), findsOneWidget);
    expect(find.text('Rampa'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tela: sem resposta e sem nada salvo, explica e oferece tentar de novo', (tester) async {
    TelaMapaCampus.mostrarFundo = false;
    addTearDown(() => TelaMapaCampus.mostrarFundo = true);
    final repo = RepositorioMapaCampus(buscar: () async => null);
    await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: TelaMapaCampus(repositorio: repo)));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
    expect(find.text('Não consegui carregar o mapa agora'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsOneWidget);
  });
}
