// Menu: atalhos de Editais e do Mapa do campus (issue #23).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/config.dart';
import 'package:ufac_no_bolso/data/editais.dart';
import 'package:ufac_no_bolso/data/perfil.dart';
import 'package:ufac_no_bolso/screens/editais.dart';
import 'package:ufac_no_bolso/screens/menu.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';
import 'package:ufac_no_bolso/ui/componentes.dart';
import 'package:url_launcher/url_launcher.dart';

Widget app(Widget tela) => MaterialApp(theme: AppTema.claro, home: tela);

void main() {
  late List<(Uri, LaunchMode)> abertos;
  late bool abre;

  setUp(() {
    abertos = [];
    abre = true;
    abridorExterno = (u, modo) async {
      abertos.add((u, modo));
      return abre;
    };
  });
  tearDown(() => Perfil.instancia.atual = PerfilUsuario.aluno);

  test('o mapa oficial do campus fica na configuração', () {
    expect(urlMapaCampus, 'https://sistemas.ufac.br/mapa/');
  });

  testWidgets('aluno vê Editais e o Mapa do campus no Menu', (tester) async {
    await tester.pumpWidget(app(const TelaMenu()));
    expect(find.text('Editais'), findsOneWidget);
    expect(find.text('Proaes, Prograd e Proex'), findsOneWidget);
    expect(find.text('Mapa do campus'), findsOneWidget);
    expect(find.text('Blocos e setores · site oficial da Ufac'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('professor vê só o Mapa do campus', (tester) async {
    Perfil.instancia.atual = PerfilUsuario.professor;
    await tester.pumpWidget(app(const TelaMenu()));
    expect(find.text('Editais'), findsNothing);
    expect(find.text('Mapa do campus'), findsOneWidget);
  });

  testWidgets('o mapa abre no navegador do celular, fora do app', (tester) async {
    await tester.pumpWidget(app(const TelaMenu()));
    await tester.tap(find.text('Mapa do campus'));
    await tester.pump();
    expect(abertos, [(Uri.parse(urlMapaCampus), LaunchMode.externalApplication)]);
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('se o navegador não abrir, avisa em linguagem humana', (tester) async {
    abre = false;
    await tester.pumpWidget(app(const TelaMenu()));
    await tester.tap(find.text('Mapa do campus'));
    await tester.pump();
    expect(find.text('Não consegui abrir o navegador neste celular.'), findsOneWidget);
  });

  group('tela de Editais', () {
    String texto(String nome) => File('fixtures/public/$nome').readAsStringSync();

    RepositorioEditais repositorio(Future<(int, String)> Function(Uri) buscar, [Map<String, String>? guardados]) {
      final g = guardados ?? {};
      return RepositorioEditais(
        buscar: buscar,
        lerGuardado: (k) async => g[k],
        gravar: (k, v) async => g[k] = v,
        apagar: (k) async => g.remove(k),
      );
    }

    testWidgets('mostra as três abas e abre o edital fora do app', (tester) async {
      final r = repositorio(
        (u) async => (200, texto(u.path.startsWith('/proex/') ? 'proex_editais.json' : 'proaes_editais.json')),
      );
      await tester.pumpWidget(app(TelaEditais(repositorio: r)));
      await tester.pumpAndSettle();
      for (final aba in ['Proaes', 'Prograd', 'Proex']) {
        expect(find.text(aba), findsOneWidget);
      }
      expect(find.text('Edital Proaes nº 22/2026 - Programa Pulsar Acolhe'), findsOneWidget);
      await tester.tap(find.text('Edital Proaes nº 22/2026 - Programa Pulsar Acolhe'));
      await tester.pump();
      expect(
        abertos.single.$1.toString(),
        'https://www3.ufac.br/proaes/2026/edital-proaes-no-22-2026-programa-pulsar-acolhe',
      );
      expect(abertos.single.$2, LaunchMode.externalApplication);

      await tester.tap(find.text('Proex'));
      await tester.pumpAndSettle();
      expect(find.text('Extensão, cultura e esporte'), findsOneWidget);
      expect(find.textContaining('17 editais de'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sem resposta e sem cache: estado de erro com Tentar de novo', (tester) async {
      await tester.pumpWidget(
        app(TelaEditais(repositorio: repositorio((_) async => throw const SocketException('x')))),
      );
      await tester.pumpAndSettle();
      expect(find.text('Não consegui falar com o site da Proaes agora'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
    });

    testWidgets('sem resposta com cache: mostra o cache e avisa', (tester) async {
      final guardados = <String, String>{};
      await repositorio(
        (_) async => (200, texto('proaes_editais.json')),
        guardados,
      ).ler(FonteEditais.proaes, agora: DateTime.now().subtract(const Duration(hours: 7)));
      await tester.pumpWidget(app(TelaEditais(repositorio: repositorio((_) async => (503, ''), guardados))));
      await tester.pumpAndSettle();
      expect(find.byType(FaixaAviso), findsOneWidget);
      expect(find.text('Edital Proaes nº 22/2026 - Programa Pulsar Acolhe'), findsOneWidget);
    });
  });
}
