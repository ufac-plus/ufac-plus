// Seletor de semestre nas Notas (issue #23, seção 1): a lista de semestres sai da mesma página de hoje (nenhum
// pedido a mais); um semestre anterior só é lido quando a pessoa o escolhe e fica no cache para sempre.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/banco.dart';
import 'package:ufac_no_bolso/data/repositorio_portal.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';
import 'package:ufac_no_bolso/screens/notas.dart';
import 'package:ufac_no_bolso/session/regras_sessao.dart';
import 'package:ufac_no_bolso/session/sessao.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';

String fixture(String nome) => File('fixtures/$nome').readAsStringSync();

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

  group('extrator: todos os semestres da página de Notas', () {
    test('o mais recente primeiro, cada um com as suas disciplinas', () {
      final s = lerSemestresDeNotas(fixture('portal_notas.html'))!;
      expect(s.map((x) => x.semestre), [atual, anterior]);
      expect(s[0].disciplinas.map((d) => d.disciplina), ['Disciplina Atual', 'Outra Disciplina']);
      expect(s[1].disciplinas.single.disciplina, 'Disciplina Antiga');
      expect(s[1].disciplinas.single.situacao, 'Aprovado');
      // O quadro do semestre antigo vem por outro pedido (o mesmo notaturma), não no HTML da página.
      expect(s[1].disciplinas.single.urlNotas, contains('idCurricAluno=900010003'));
      expect(s[1].disciplinas.single.urlTurma, 'https://portal.ufac.br/aluno/aluno/turma.action?turma=10003');
    });
    test('ordena pelo ano e semestre mesmo se a página vier fora de ordem', () {
      final pagina = fixture('portal_notas.html');
      final blocos = RegExp(r'<h3>.*?</table></div>', dotAll: true).allMatches(pagina).map((m) => m[0]!).toList();
      final invertida = pagina.replaceFirst(blocos.join('\n'), blocos.reversed.join('\n'));
      expect(invertida, isNot(pagina));
      expect(lerSemestresDeNotas(invertida)!.map((x) => x.semestre), [atual, anterior]);
    });
    test('página de login devolve null; lerListaDeNotas continua sendo o mais recente', () {
      expect(lerSemestresDeNotas(fixture('public/portal_login.html')), isNull);
      expect(lerListaDeNotas(fixture('portal_notas.html'))!.semestre, atual);
    });
    test('o mais recente sem tabela não deixa um semestre encerrado virar o atual', () {
      final pagina = fixture('portal_notas.html').replaceFirst('<table class="table-turmas">', '<table class="outra">');
      expect(lerSemestresDeNotas(pagina), isNull);
      expect(lerListaDeNotas(pagina), isNull);
    });
    test('um semestre antigo sem tabela é só pulado', () {
      final pagina = fixture('portal_notas.html').replaceFirst(
        '</div>\n</div></div></div></div>',
        '</div>\n<h3><a href="#" class="accordionTurma">2° Semestre / 2025</a></h3><div><p>vazio</p></div>\n</div></div></div></div>',
      );
      expect(pagina, contains('2025'));
      expect(lerSemestresDeNotas(pagina)!.map((x) => x.semestre), [atual, anterior]);
    });
    test('a lista sobrevive a gravar e ler', () {
      final s = lerSemestresDeNotas(fixture('portal_notas.html'))!.last;
      final volta = ListaDeNotas.deMapa(jsonDecode(jsonEncode(s.paraMapa())) as Map<String, dynamic>);
      expect(volta.semestre, anterior);
      expect(volta.disciplinas.single.urlNotas, s.disciplinas.single.urlNotas);
      expect(volta.disciplinas.single.urlTurma, s.disciplinas.single.urlTurma);
    });
  });

  group('leitura na Ufac', () {
    test('o semestre atual faz os mesmos pedidos de antes e guarda a lista de semestres', () async {
      final pedidos = ufacFalsa();
      expect(await portal.atualizar(), ResultadoPortal.atualizado);
      // Página de Notas + quadro e turma de cada uma das 2 disciplinas atuais. Nada do semestre antigo.
      expect(pedidosDeNotas(pedidos), 5);
      expect(pedidos.any((p) => p.contains('900010003') || p.contains('turma=10003')), isFalse);
      expect(portal.semestreDasNotas, atual);
      expect(portal.notas!.map((d) => d.disciplina), ['Disciplina Atual', 'Outra Disciplina']);
      expect(portal.listaDeSemestres.map((s) => '${s.semestre}|${s.atual}'), ['$atual|true', '$anterior|false']);
      expect(portal.precisaLer(anterior), isTrue);
    });

    test('o anterior é lido só quando escolhido, sem reler a página de Notas, e fica guardado', () async {
      final pedidos = ufacFalsa();
      await portal.atualizar();
      pedidos.clear();
      expect(await portal.atualizarSemestre(anterior), ResultadoPortal.atualizado);
      expect(pedidos.length, 2); // quadro + carga horária da única disciplina
      expect(pedidos.any((p) => p.contains('nota/nota.action')), isFalse);
      final s = portal.semestreEmCache(anterior)!;
      expect(s.atual, isFalse);
      expect(s.disciplinas.single.disciplina, 'Disciplina Antiga');
      expect(s.disciplinas.single.media, '8,0');
      expect(s.disciplinas.single.cargaHoraria, 60);
      // As outras telas continuam vendo o atual.
      expect(portal.semestreDasNotas, atual);
      expect(portal.notas!.length, 2);
      expect(portal.precisaLer(anterior), isFalse);
      // Reler o anterior (puxar para atualizar nele) não pede a carga de novo.
      pedidos.clear();
      await portal.atualizarSemestre(anterior);
      expect(pedidos.length, 1);
      // Reler o atual não apaga o anterior guardado.
      await portal.atualizar();
      expect(portal.semestreEmCache(anterior)!.disciplinas.length, 1);
      // Fica no cache: um app recém-aberto ainda tem os dois.
      portal.limparCache();
      await portal.carregarSalvos();
      expect(portal.semestreDasNotas, atual);
      expect(portal.semestreEmCache(null)!.atual, isTrue);
      expect(portal.semestreEmCache(anterior)!.disciplinas.single.disciplina, 'Disciplina Antiga');
      expect(portal.listaDeSemestres.length, 2);
    });

    test('cache antigo (sem a lista de semestres) continua abrindo e ganha a lista na próxima leitura', () async {
      Banco.memoria!['notas_v2'] = jsonEncode({
        'semestre': atual,
        'lidasEm': '2026-11-01T10:00:00.000',
        'disciplinas': [
          {
            'disciplina': 'Disciplina Atual',
            'situacao': 'Matrícula',
            'media': '',
            'faltas': '2',
            'carga': 30,
            'notas': [],
            'resumo': [],
          },
        ],
      });
      await portal.carregarSalvos();
      expect(portal.notas!.length, 1);
      expect(portal.listaDeSemestres.map((s) => s.semestre), [atual]);
      final pedidos = ufacFalsa();
      await portal.atualizar();
      // A carga horária já conhecida não é pedida de novo.
      expect(pedidos.where((p) => p.contains('turma=10001')).length, 0);
      expect(portal.notas!.first.cargaHoraria, 30);
      expect(portal.listaDeSemestres.length, 2);
    });

    test('ler o atual e um anterior ao mesmo tempo não perde nenhum dos dois', () async {
      for (final atraso in [0, 5, 10, 20]) {
        ufacFalsa();
        portal.limpar();
        Banco.memoria = {};
        await portal.atualizar();
        final lidasAntes = portal.notasLidasEm;
        await Future<void>.delayed(const Duration(milliseconds: 2));
        ufacFalsa(atraso: (_) => const Duration(milliseconds: 3));
        final leituras = [
          Future<void>.delayed(Duration(milliseconds: atraso)).then((_) => portal.atualizarSemestre(anterior)),
          portal.atualizar(),
        ];
        // As duas leituras correm juntas e cada uma tem o seu esqueleto.
        await Future<void>.delayed(Duration(milliseconds: atraso + 1));
        expect(portal.lendoSemestre(anterior), isTrue, reason: 'atraso $atraso');
        expect(portal.lendoSemestre(null), isTrue, reason: 'atraso $atraso');
        await Future.wait(leituras);
        expect(portal.lendoSemestre(anterior), isFalse);
        expect(portal.lendoSemestre(null), isFalse);
        expect(portal.notasLidasEm, isNot(lidasAntes), reason: 'atraso $atraso');
        expect(portal.semestreEmCache(anterior)?.disciplinas.length, 1, reason: 'atraso $atraso');
        // E o que foi gravado também tem os dois.
        final gravado = jsonDecode(Banco.memoria!['notas_v2']!) as Map<String, dynamic>;
        expect(gravado['lidasEm'], portal.notasLidasEm!.toIso8601String(), reason: 'atraso $atraso');
        expect((gravado['anteriores'] as Map).keys, [anterior], reason: 'atraso $atraso');
      }
    });

    test('semestre que não está na lista não faz pedido nenhum', () async {
      final pedidos = ufacFalsa();
      await portal.atualizar();
      pedidos.clear();
      expect(await portal.atualizarSemestre('1° Semestre / 2020'), ResultadoPortal.falhou);
      expect(pedidos, isEmpty);
    });

    test('sessão caída no meio de um anterior: nada é gravado e a tela oferece entrar', () async {
      ufacFalsa();
      await portal.atualizar();
      Sessao.instancia.leitor = (_, _) async => const PaginaLida(ResultadoVerificacao.expirada);
      expect(await portal.atualizarSemestre(anterior), ResultadoPortal.sessaoExpirada);
      expect(portal.semestreEmCache(anterior), isNull);
      expect(Sessao.instancia.expirados, contains(Sistema.portal));
    });
  });

  testWidgets('tela: pílula do semestre, quanto preciso no exame, frequência e troca para um anterior', (tester) async {
    final semestres = lerSemestresDeNotas(fixture('portal_notas.html'))!;
    final comExame = lerNotasDaDisciplina(
      fixture('portal_notaturma_exame_ajax.html'),
      semestres.first.disciplinas.first,
    ).comCargaHoraria(60);
    Banco.memoria!['notas_v2'] = jsonEncode({
      'semestre': atual,
      'lidasEm': '2026-11-20T10:00:00.000',
      'disciplinas': [comExame.paraMapa()],
      'semestres': [for (final s in semestres) s.paraMapa()],
    });
    await tester.runAsync(portal.carregarSalvos);
    final pedidos = ufacFalsa();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTema.claro,
        home: const Scaffold(body: TelaNotas()),
      ),
    );

    expect(find.bySemanticsLabel('2º / 2026, trocar semestre'), findsOneWidget);
    expect(find.text('Para passar, você precisa de pelo menos 6,5 no exame'), findsOneWidget);
    expect(find.textContaining('Frequência 93% · carga de 60 h · a 17ª falta reprova'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('2º / 2026, trocar semestre'));
    await tester.pumpAndSettle();
    expect(find.text('Atual'), findsOneWidget);
    await tester.tap(find.text('1º / 2026'));
    await tester.pumpAndSettle();
    expect(find.text('Disciplina Antiga'), findsOneWidget);
    expect(find.bySemanticsLabel('1º / 2026, trocar semestre'), findsOneWidget);
    // Semestre encerrado não mostra "quanto preciso no exame".
    expect(find.textContaining('no exame'), findsNothing);
    expect(pedidos.length, 2);
    expect(tester.takeException(), isNull);
  });
}
