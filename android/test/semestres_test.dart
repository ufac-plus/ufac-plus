import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/academico.dart';
import 'package:ufac_no_bolso/data/banco.dart';
import 'package:ufac_no_bolso/data/repositorio_portal.dart';
import 'package:ufac_no_bolso/data/semestres.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';
import 'package:ufac_no_bolso/screens/notas.dart';
import 'package:ufac_no_bolso/session/regras_sessao.dart';
import 'package:ufac_no_bolso/session/sessao.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';

// Seletor de semestre na tela Notas (igual ao iPhone, iphone/web/test/notas_semestres.test.js): a lista
// de semestres sai da mesma página de hoje (nenhum pedido a mais); um semestre anterior só é lido quando a
// pessoa o escolhe e fica no cache, sem ser relido ao voltar.

String fixture(String nome) => File('fixtures/$nome').readAsStringSync();

const atual = '2° Semestre / 2026';
const anterior = '1° Semestre / 2026';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  _extrator();
  _funcoesPuras();
  _repositorio();
  _tela();
}

void _extrator() {
  group('lerSemestresDeNotas', () {
    test('mais recente primeiro, com as disciplinas de cada um', () {
      final s = lerSemestresDeNotas(fixture('portal_notas.html'))!;
      expect(s.map((x) => x.semestre), [atual, anterior]);
      expect(s[0].disciplinas.map((d) => d.disciplina), ['Disciplina Atual', 'Outra Disciplina']);
      expect(s[1].disciplinas.map((d) => '${d.disciplina}|${d.situacao}'), ['Disciplina Antiga|Aprovado']);
      // O quadro do semestre antigo vem por outro pedido (o mesmo notaturma), não no HTML da página.
      expect(s[1].disciplinas.first.urlNotas, contains('idCurricAluno=900010003'));
      expect(s[1].disciplinas.first.urlNotas, contains('periodo=101'));
      expect(s[1].disciplinas.first.urlTurma, 'https://portal.ufac.br/aluno/aluno/turma.action?turma=10003');
    });

    test('ordena pelo ano e semestre mesmo se a página vier fora de ordem', () {
      final pagina = fixture('portal_notas.html');
      final partes = pagina.split(RegExp(r'(?=<h3>)'));
      expect(partes.length, 3);
      final invertida = pagina.replaceFirst(partes[1] + partes[2], partes[2] + partes[1]);
      expect(invertida, isNot(pagina));
      expect(lerSemestresDeNotas(invertida)!.map((x) => x.semestre), [atual, anterior]);
      expect(lerListaDeNotas(invertida)!.semestre, atual);
    });

    test('página de login não vira dado; a lista de sempre continua igual', () {
      expect(lerSemestresDeNotas(fixture('public/portal_login.html')), isNull);
      expect(lerListaDeNotas(fixture('portal_notas.html'))!.semestre, atual);
    });

    test('o mais recente sem tabela não deixa um semestre encerrado virar o atual', () {
      final pagina = fixture('portal_notas.html').replaceFirst(
        '<h3>',
        '<h3><a href="#" class="accordionTurma">1° Semestre / 2027</a></h3><div><p>Sem turmas</p></div><h3>',
      );
      expect(lerSemestresDeNotas(pagina), isNull);
      expect(lerListaDeNotas(pagina), isNull);
    });

    test('um semestre antigo sem tabela é só pulado', () {
      final pagina = fixture('portal_notas.html').replaceFirst(
        '</div></div></div></div>',
        '<h3><a href="#" class="accordionTurma">2° Semestre / 2025</a></h3><div></div>\n</div></div></div></div>',
      );
      expect(pagina, contains('2025'));
      expect(lerSemestresDeNotas(pagina)!.map((x) => x.semestre), [atual, anterior]);
    });

    test('a lista sobrevive a gravar e ler (vai para o cache)', () {
      final l = lerSemestresDeNotas(fixture('portal_notas.html'))![1];
      final volta = ListaDeNotas.deMapa(jsonDecode(jsonEncode(l.paraMapa())) as Map<String, dynamic>);
      expect(volta.semestre, anterior);
      expect(volta.disciplinas.single.disciplina, 'Disciplina Antiga');
      expect(volta.disciplinas.single.urlNotas, l.disciplinas.single.urlNotas);
      expect(volta.disciplinas.single.urlTurma, l.disciplinas.single.urlTurma);
      const semLink = DisciplinaDoSemestre('X', 'Aprovado', null);
      expect(DisciplinaDoSemestre.deMapa(semLink.paraMapa()).urlNotas, isNull);
    });
  });
}

void _funcoesPuras() {
  group('cache dos semestres', () {
    final doAtual = SemestreLido(
      semestre: atual,
      disciplinas: const [NotasDisciplina(disciplina: 'Disciplina Atual', situacao: 'Matrícula')],
      lidoEm: DateTime(2026, 11, 21, 10),
      atual: true,
    );
    final anteriores = {
      anterior: SemestreLido(
        semestre: anterior,
        disciplinas: const [NotasDisciplina(disciplina: 'Disciplina Antiga', situacao: 'Aprovado', cargaHoraria: 60)],
        lidoEm: DateTime(2026, 8, 1, 10),
      ),
    };

    test('lista com o atual marcado; cache antigo (sem a lista) mostra só o atual', () {
      expect(listaDeSemestres(atual, [atual, anterior]), [
        const OpcaoSemestre(atual, atual: true),
        const OpcaoSemestre(anterior, atual: false),
      ]);
      expect(listaDeSemestres(atual, const []), [const OpcaoSemestre(atual, atual: true)]);
      expect(listaDeSemestres(null, [atual, anterior]), isEmpty);
    });

    test('escolhe o semestre do cache', () {
      expect(semestreEmCache(doAtual, anteriores, null)!.atual, isTrue);
      expect(semestreEmCache(doAtual, anteriores, atual)!.semestre, atual);
      final antigo = semestreEmCache(doAtual, anteriores, anterior)!;
      expect(antigo.atual, isFalse);
      expect(antigo.disciplinas.single.disciplina, 'Disciplina Antiga');
      expect(semestreEmCache(doAtual, const {}, anterior), isNull);
      expect(semestreEmCache(null, anteriores, null), isNull);
    });

    test('semestre encerrado só é lido se nunca foi', () {
      expect(precisaLerSemestre(doAtual, anteriores, anterior), isFalse);
      expect(precisaLerSemestre(doAtual, const {}, anterior), isTrue);
      expect(precisaLerSemestre(doAtual, const {}, atual), isFalse);
    });

    test('quando a página avança de semestre, o novo atual sai dos anteriores', () {
      expect(anterioresSemOAtual(anteriores, anterior), isEmpty);
      expect(anterioresSemOAtual(anteriores, atual).keys, [anterior]);
    });

    test('semestre lido sobrevive a gravar e ler, com a carga horária', () {
      final s = anteriores[anterior]!;
      final volta = SemestreLido.deMapa(jsonDecode(jsonEncode(s.paraMapa())) as Map<String, dynamic>);
      expect(volta.semestre, anterior);
      expect(volta.lidoEm, s.lidoEm);
      expect(volta.atual, isFalse);
      expect(volta.disciplinas.single.cargaHoraria, 60);
    });
  });
}

/// Ufac falsa: conta os pedidos para provar que nada é lido à toa.
List<String> _ufacFalsa({ResultadoVerificacao resultado = ResultadoVerificacao.ativa}) {
  final pedidos = <String>[];
  final notaturma = fixture('portal_notaturma_ajax.html');
  final turma = fixture('portal_turma.html');
  final notas = fixture('portal_notas.html');
  Sessao.instancia.leitor = (_, url) async {
    pedidos.add(url);
    if (resultado != ResultadoVerificacao.ativa) return PaginaLida(resultado);
    final corpo = url.contains('notaturma.action')
        ? notaturma
        : url.contains('turma.action')
            ? turma
            : url.contains('nota/nota.action')
                ? notas
                : '<p></p>';
    return PaginaLida(ResultadoVerificacao.ativa, corpo);
  };
  return pedidos;
}

/// Repositório como fica depois de ler o semestre atual (sem SQLite: o banco é um mapa).
Map<String, String> _prepararRepositorio() {
  FlutterSecureStorage.setMockInitialValues({});
  Sessao.instancia.expirados.clear();
  final gravados = <String, String>{};
  final portal = RepositorioPortal.instancia
    ..limpar()
    ..gravarNoBanco = (chave, valor) async => gravados[chave] = valor;
  portal
    ..semestreDasNotas = atual
    ..notasLidasEm = DateTime.now()
    ..notas = const [
      NotasDisciplina(disciplina: 'Disciplina Atual', situacao: 'Matrícula', faltas: '2', cargaHoraria: 60),
      NotasDisciplina(disciplina: 'Outra Disciplina', situacao: 'Matrícula', faltas: '0', cargaHoraria: 30),
    ]
    ..semestresDasNotas = lerSemestresDeNotas(fixture('portal_notas.html'))!;
  return gravados;
}

void _limparRepositorio() {
  RepositorioPortal.instancia
    ..limpar()
    ..gravarNoBanco = Banco.gravar;
  Sessao.instancia.expirados.clear();
  Sessao.instancia.leitor = (_, _) async => const PaginaLida(ResultadoVerificacao.semResposta);
}

void _repositorio() {
  group('leitura de um semestre anterior', () {
    late Map<String, String> gravados;
    setUp(() => gravados = _prepararRepositorio());
    tearDown(_limparRepositorio);

    test('a lista de semestres do seletor vem da página já lida', () {
      expect(RepositorioPortal.instancia.opcoesDeSemestre.map((o) => '${o.semestre}|${o.atual}'), [
        '$atual|true',
        '$anterior|false',
      ]);
    });

    test('lido só quando escolhido, sem reler a página de Notas, e fica guardado', () async {
      final portal = RepositorioPortal.instancia;
      final pedidos = _ufacFalsa();
      expect(portal.precisaLer(anterior), isTrue);
      expect(portal.notasDoSemestre(anterior), isNull);

      expect(await portal.atualizarSemestre(anterior), ResultadoPortal.atualizado);
      expect(pedidos.length, 2); // quadro + carga horária da única disciplina
      expect(pedidos.any((p) => p.contains('nota/nota.action')), isFalse);
      expect(pedidos.every((p) => p.contains('900010003') || p.contains('turma=10003')), isTrue);

      final s = portal.notasDoSemestre(anterior)!;
      expect(s.atual, isFalse);
      final d = s.disciplinas.single;
      expect(d.disciplina, 'Disciplina Antiga');
      expect(d.media, '8,0');
      expect(d.faltas, '4');
      expect(d.cargaHoraria, 60);
      // A Início continua vendo o atual.
      expect(portal.semestreDasNotas, atual);
      expect(portal.notas!.length, 2);
      expect(portal.notasDoSemestre(null)!.semestre, atual);
      // Encerrado já lido não é pedido de novo ao escolher.
      expect(portal.precisaLer(anterior), isFalse);
      expect(portal.lendoSemestres, isEmpty);

      // Foi para o cache junto com o atual e a lista de semestres.
      final salvo = jsonDecode(gravados['notas_v2']!) as Map<String, dynamic>;
      expect(salvo['semestre'], atual);
      expect((salvo['disciplinas'] as List).length, 2);
      expect((salvo['semestres'] as List).length, 2);
      final guardado = SemestreLido.deMapa((salvo['anteriores'] as Map<String, dynamic>)[anterior] as Map<String, dynamic>);
      expect(guardado.disciplinas.single.media, '8,0');
    });

    test('puxar para atualizar no semestre anterior relê só o quadro (a carga já é conhecida)', () async {
      final portal = RepositorioPortal.instancia;
      final pedidos = _ufacFalsa();
      await portal.atualizarSemestre(anterior);
      pedidos.clear();
      expect(await portal.atualizarSemestre(anterior), ResultadoPortal.atualizado);
      expect(pedidos.length, 1);
      expect(pedidos.single, contains('notaturma.action'));
      expect(portal.notasDoSemestre(anterior)!.disciplinas.single.cargaHoraria, 60);
    });

    test('semestre que não está na lista não faz pedido nenhum', () async {
      final pedidos = _ufacFalsa();
      expect(await RepositorioPortal.instancia.atualizarSemestre('1° Semestre / 2020'), ResultadoPortal.falhou);
      expect(pedidos, isEmpty);
    });

    test('sessão caída: avisa para entrar e não guarda nada', () async {
      final portal = RepositorioPortal.instancia;
      _ufacFalsa(resultado: ResultadoVerificacao.expirada);
      expect(await portal.atualizarSemestre(anterior), ResultadoPortal.sessaoExpirada);
      expect(portal.notasDoSemestre(anterior), isNull);
      expect(portal.precisaLer(anterior), isTrue);
      expect(gravados, isEmpty);
    });

    test('sem resposta da Ufac: falhou, sem guardar', () async {
      final portal = RepositorioPortal.instancia;
      _ufacFalsa(resultado: ResultadoVerificacao.semResposta);
      expect(await portal.atualizarSemestre(anterior), ResultadoPortal.falhou);
      expect(portal.notasDoSemestre(anterior), isNull);
      expect(gravados, isEmpty);
    });

    test('"Limpar dados" apaga a lista e os anteriores', () async {
      final portal = RepositorioPortal.instancia;
      _ufacFalsa();
      await portal.atualizarSemestre(anterior);
      portal.limparCache();
      expect(portal.opcoesDeSemestre, isEmpty);
      expect(portal.notasAnteriores, isEmpty);
      expect(portal.notasDoSemestre(anterior), isNull);
    });
  });
}

void _tela() {
  group('tela Notas', () {
    setUp(_prepararRepositorio);
    tearDown(_limparRepositorio);

    Future<void> abrir(WidgetTester tester) async {
      await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: const Scaffold(body: TelaNotas())));
      await tester.pumpAndSettle();
    }

    testWidgets('pílula abre a folha com os semestres e lê o anterior escolhido', (tester) async {
      final pedidos = _ufacFalsa();
      await abrir(tester);
      expect(find.text('Disciplina Atual'), findsOneWidget);
      expect(find.text('2º / 2026'), findsOneWidget);

      await tester.tap(find.text('2º / 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Semestre'), findsOneWidget);
      expect(find.text('1º / 2026'), findsOneWidget);
      expect(find.text('Atual'), findsOneWidget);
      expect(find.byIcon(Icons.check_rounded), findsOneWidget);
      expect(pedidos, isEmpty); // abrir a folha não pede nada à Ufac

      await tester.tap(find.text('1º / 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Disciplina Antiga'), findsOneWidget);
      expect(find.text('Disciplina Atual'), findsNothing);
      expect(find.text('1º / 2026'), findsOneWidget); // a pílula agora mostra o anterior
      expect(pedidos.length, 2);
      expect(tester.takeException(), isNull);

      // Voltar ao atual e de novo ao anterior: abre do cache, sem pedido nenhum.
      pedidos.clear();
      await tester.tap(find.text('1º / 2026'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('2º / 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Disciplina Atual'), findsOneWidget);
      await tester.tap(find.text('2º / 2026'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('1º / 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Disciplina Antiga'), findsOneWidget);
      expect(pedidos, isEmpty);
    });

    testWidgets('semestre anterior que não deu para ler mostra o estado vazio', (tester) async {
      _ufacFalsa(resultado: ResultadoVerificacao.semResposta);
      await abrir(tester);
      await tester.tap(find.text('2º / 2026'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('1º / 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Ainda não li as notas deste semestre'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
      // Deixa o aviso "Não consegui ler o Portal agora" sumir antes de o teste acabar.
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();
    });

    testWidgets('semestre sem disciplinas', (tester) async {
      RepositorioPortal.instancia.notasAnteriores = {
        anterior: SemestreLido(semestre: anterior, disciplinas: const [], lidoEm: DateTime(2026, 8, 1)),
      };
      final pedidos = _ufacFalsa();
      await abrir(tester);
      await tester.tap(find.text('2º / 2026'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('1º / 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Nenhuma disciplina neste semestre'), findsOneWidget);
      expect(pedidos, isEmpty);
    });

    testWidgets('com um semestre só, fica o texto de sempre, sem pílula', (tester) async {
      RepositorioPortal.instancia.semestresDasNotas = const [];
      await abrir(tester);
      expect(find.text(atual), findsOneWidget);
      expect(find.text('2º / 2026'), findsNothing);
    });
  });
}
