// Seletor de semestre com o cache da 0.1.13 (sem a lista de semestres). Arquivo próprio: o repositório do
// Portal é único no app, e os testes do outro arquivo deixam leituras pela metade nele.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/banco.dart';
import 'package:ufac_no_bolso/data/repositorio_portal.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';
import 'package:ufac_no_bolso/screens/notas.dart';
import 'package:ufac_no_bolso/session/sessao.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';

// Sem o \r do Windows: os testes montam trechos com \n (no Mac e no robô do GitHub já é assim).
String fixture(String nome) => File('fixtures/$nome').readAsStringSync().replaceAll('\r\n', '\n');

const atual = '2° Semestre / 2026';
const anterior = '1° Semestre / 2026';

/// Ufac falsa: conta os pedidos para provar que nada é lido à toa. `atraso` deixa as corridas à vista.
List<String> ufacFalsa({Duration Function(String url)? atraso}) {
  final pedidos = <String>[];
  Sessao.instancia.leitor = (_, url) async {
    pedidos.add(url);
    if (atraso != null) await Future<void>.delayed(atraso(url));
    final corpo = url.contains('nota/nota.action')
        ? fixture('portal_notas.html')
        : url.contains('notaturma.action')
        ? fixture('portal_notaturma_ajax.html')
        : url.contains('turma.action')
        ? fixture('portal_turma.html')
        : url.contains('relatorios.action')
        ? fixture('portal_relatorios.html')
        : url.contains('quadrohorario')
        ? fixture('portal_horarios_ajax.html')
        : fixture('portal_inicio.html');
    return PaginaLida(ResultadoVerificacao.ativa, corpo);
  };
  return pedidos;
}

int pedidosDeNotas(List<String> pedidos) => pedidos
    .where((p) => p.contains('nota/nota.action') || p.contains('notaturma') || p.contains('turma.action'))
    .length;

void main() {
  final portal = RepositorioPortal.instancia;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    Banco.memoria = {};
    portal.limpar();
  });

  testWidgets('cache da 0.1.13 (sem a lista de semestres): a pílula aparece e, ao tocar, lê a lista', (tester) async {
    // Um teste anterior pode deixar uma leitura pela metade no repositório (ele é único no app).
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    portal
      ..limpar()
      ..carregando = false;
    final semestres = lerSemestresDeNotas(fixture('portal_notas.html'))!;
    // Formato antigo: notas do semestre atual, sem o campo 'semestres'.
    Banco.memoria!['notas_v2'] = jsonEncode({
      'semestre': atual,
      'lidasEm': '2026-11-10T10:00:00.000',
      'disciplinas': [
        lerNotasDaDisciplina(fixture('portal_notaturma_ajax.html'), semestres.first.disciplinas.first).paraMapa(),
      ],
    });
    await tester.runAsync(portal.carregarSalvos);
    expect(portal.temListaDeSemestres, isFalse);
    final pedidos = ufacFalsa();
    await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: const Scaffold(body: TelaNotas())));

    expect(find.bySemanticsLabel('2º / 2026, trocar semestre'), findsOneWidget, reason: 'antes ela sumia');
    await tester.tap(find.bySemanticsLabel('2º / 2026, trocar semestre'));
    for (var i = 0; i < 100 && find.text('1º / 2026').evaluate().isEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pumpAndSettle();
    }
    expect(portal.temListaDeSemestres, isTrue);
    expect(pedidos.any((p) => p.contains('nota/nota.action')), isTrue);
    expect(find.text('1º / 2026'), findsOneWidget, reason: 'a folha abre com os semestres anteriores');
    expect(tester.takeException(), isNull);
  });
}
