// Editais da Proaes, da Prograd e da Proex: listagem pública (API do Plone em www3.ufac.br), sem login.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/editais.dart';
import 'package:ufac_no_bolso/extractors/editais.dart';

Object? fixture(String nome) => jsonDecode(File('fixtures/public/$nome').readAsStringSync());
String texto(String nome) => File('fixtures/public/$nome').readAsStringSync();

void main() {
  group('extrator de editais', () {
    test('lê título, link e datas da Proaes, do mais novo para o mais antigo', () {
      final lista = lerEditais(fixture('proaes_editais.json'))!;
      expect(lista, hasLength(6));
      expect(lista[0].titulo, 'Edital Proaes nº 22/2026 - Programa Pulsar Acolhe');
      expect(lista[0].url, 'https://www3.ufac.br/proaes/2026/edital-proaes-no-22-2026-programa-pulsar-acolhe');
      expect(lista[0].publicadoEm, DateTime.utc(2026, 11, 6, 22, 13, 2));
      expect(lista[0].atualizadoEm, DateTime.utc(2026, 11, 16, 14, 49, 40));
    });

    test('aceita também os itens do tipo Link (Prograd)', () {
      final lista = lerEditais(fixture('prograd_editais.json'))!;
      expect(lista, hasLength(4));
      expect(lista[2].titulo, startsWith('Edital Prograd nº 47/2026'));
    });

    test('lê os 17 editais da Proex de 2026', () {
      final lista = lerEditais(fixture('proex_editais.json'))!;
      expect(lista, hasLength(17));
      expect(lista.first.titulo, startsWith('Edital Proex/Proppi nº 17/2026'));
      expect(lista.every((e) => e.url.startsWith('https://www3.ufac.br/proex/2026/')), isTrue);
      // Espaços repetidos no título viram um só.
      expect(lista.any((e) => e.titulo.contains('  ')), isFalse);
    });

    test('ano sem edital é lista vazia', () {
      expect(lerEditais(fixture('proaes_editais_vazio.json')), isEmpty);
    });

    test('resposta que não é a listagem não vira dado', () {
      expect(lerEditais(null), isNull);
      expect(lerEditais('<html></html>'), isNull);
      expect(lerEditais({'erro': 'x'}), isNull);
      expect(lerEditais([1, 2]), isNull);
    });

    test('descarta link fora da Ufac, http, tipo estranho, título vazio e data inválida', () {
      final lista = lerEditais({
        'items_total': 5,
        'items': [
          {'@id': 'https://exemplo.org/x', '@type': 'Folder', 'title': 'Fora'},
          {'@id': 'http://www3.ufac.br/proaes/2026/c', '@type': 'Folder', 'title': 'Sem https'},
          {'@id': 'https://www3.ufac.br/proaes/2026/d', '@type': 'Image', 'title': 'Foto'},
          {'@id': 'https://www3.ufac.br/proaes/2026/a', '@type': 'Folder', 'title': '   '},
          {
            '@id': 'https://www3.ufac.br/proaes/2026/b',
            '@type': 'Folder',
            'title': ' Edital  de teste ',
            'effective': 'None',
            'modified': null,
          },
        ],
      })!;
      expect(lista, hasLength(1));
      expect(lista[0].titulo, 'Edital de teste');
      expect(lista[0].url, 'https://www3.ufac.br/proaes/2026/b');
      expect(lista[0].publicadoEm, isNull);
      expect(lista[0].atualizadoEm, isNull);
    });

    test('ida e volta pelo cache', () {
      final e = lerEditais(fixture('proaes_editais.json'))!.first;
      final volta = Edital.deMapa(e.paraMapa());
      expect(volta.titulo, e.titulo);
      expect(volta.url, e.url);
      expect(volta.publicadoEm, e.publicadoEm);
      expect(volta.atualizadoEm, e.atualizadoEm);
    });
  });

  group('endereços', () {
    test('busca do ano, ordenada pela publicação, com as datas', () {
      final u = enderecoBusca(FonteEditais.proex, 2026);
      expect(u.scheme, 'https');
      expect(u.host, 'www3.ufac.br');
      expect(u.path, '/proex/@search');
      expect(u.queryParameters['path.query'], '/proex/2026');
      expect(u.queryParameters['path.depth'], '1');
      expect(u.queryParameters['sort_on'], 'effective');
      expect(u.queryParameters['sort_order'], 'descending');
      expect(u.queryParametersAll['metadata_fields'], ['effective', 'modified']);
      expect(enderecoPasta(FonteEditais.prograd, 2026), Uri.parse('https://www3.ufac.br/prograd/2026'));
    });

    test('as três pró-reitorias, com nome e assunto', () {
      expect(FonteEditais.values.map((f) => f.nome), ['Proaes', 'Prograd', 'Proex']);
      expect(FonteEditais.proex.sobre, 'Extensão, cultura e esporte');
    });

    test('só abre link do site da Ufac', () {
      expect(linkDaUfac('https://www3.ufac.br/proaes/2026/x'), isTrue);
      expect(linkDaUfac('http://www3.ufac.br/proaes/2026/x'), isFalse);
      expect(linkDaUfac('https://www3.ufac.br.exemplo.org/x'), isFalse);
      expect(linkDaUfac('https://exemplo.org/?https://www3.ufac.br/'), isFalse);
    });
  });

  group('leitura com cache', () {
    late Map<String, String> guardados;
    late List<Uri> pedidos;
    final agora = DateTime.utc(2026, 11, 21, 15);

    RepositorioEditais repositorio(Future<(int, String)> Function(Uri) buscar) => RepositorioEditais(
      buscar: (u) {
        pedidos.add(u);
        return buscar(u);
      },
      lerGuardado: (k) async => guardados[k],
      gravar: (k, v) async => guardados[k] = v,
      apagar: (k) async => guardados.remove(k),
    );

    setUp(() {
      guardados = {};
      pedidos = [];
    });

    test('lê da Ufac e guarda', () async {
      final r = repositorio((_) async => (200, texto('proaes_editais.json')));
      final lidos = await r.ler(FonteEditais.proaes, agora: agora);
      expect(lidos.ano, 2026);
      expect(lidos.lista, hasLength(6));
      expect(pedidos, [enderecoBusca(FonteEditais.proaes, 2026)]);
      final outro = repositorio((_) async => (500, ''));
      expect((await outro.carregarGuardados(FonteEditais.proaes))!.lista, hasLength(6));
    });

    test('dentro de 6 horas não pede de novo; puxar para atualizar pede', () async {
      final r = repositorio((_) async => (200, texto('proaes_editais.json')));
      await r.ler(FonteEditais.proaes, agora: agora);
      await r.ler(FonteEditais.proaes, agora: agora.add(validadeEditais - const Duration(seconds: 1)));
      expect(pedidos, hasLength(1));
      await r.ler(FonteEditais.proaes, agora: agora, forcar: true);
      expect(pedidos, hasLength(2));
      await r.ler(FonteEditais.proaes, agora: agora.add(validadeEditais + const Duration(seconds: 1)));
      expect(pedidos, hasLength(3));
    });

    test('o cache guardado no celular também vale por 6 horas', () async {
      await repositorio((_) async => (200, texto('proaes_editais.json'))).ler(FonteEditais.proaes, agora: agora);
      final r = repositorio((_) async => (200, texto('proaes_editais.json')));
      await r.carregarGuardados(FonteEditais.proaes);
      await r.ler(FonteEditais.proaes, agora: agora.add(const Duration(hours: 1)));
      expect(pedidos, hasLength(1));
    });

    test('cada pró-reitoria tem o seu cache', () async {
      final r = repositorio((u) async {
        final nome = u.path.startsWith('/proex/')
            ? 'proex_editais.json'
            : u.path.startsWith('/prograd/')
            ? 'prograd_editais.json'
            : 'proaes_editais.json';
        return (200, texto(nome));
      });
      await r.ler(FonteEditais.proaes, agora: agora);
      expect((await r.ler(FonteEditais.prograd, agora: agora)).lista, hasLength(4));
      expect((await r.ler(FonteEditais.proex, agora: agora)).lista, hasLength(17));
      expect(pedidos, hasLength(3));
      expect(r.guardados(FonteEditais.proaes)!.lista, hasLength(6));
    });

    test('começo de ano sem edital novo: mostra os do ano anterior', () async {
      final r = repositorio(
        (u) async => (
          200,
          texto(
            u.queryParameters['path.query']!.endsWith('/2027') ? 'proaes_editais_vazio.json' : 'proaes_editais.json',
          ),
        ),
      );
      final lidos = await r.ler(FonteEditais.proaes, agora: DateTime.utc(2027, 1, 5, 15));
      expect(pedidos, hasLength(2));
      expect(lidos.ano, 2026);
      expect(lidos.lista, hasLength(6));
    });

    test('virada do ano conta no fuso de Rio Branco', () async {
      final r = repositorio((_) async => (200, texto('proaes_editais.json')));
      // 1º de janeiro, 2h em UTC, ainda é 31 de dezembro no Acre.
      await r.ler(FonteEditais.proaes, agora: DateTime.utc(2027, 1, 1, 2));
      expect(pedidos.single.queryParameters['path.query'], '/proaes/2026');
    });

    test('sem rede ou erro da Ufac: semConexao', () async {
      final semRede = repositorio((_) async => throw const SocketException('sem rede'));
      await expectLater(
        semRede.ler(FonteEditais.proaes, agora: agora),
        throwsA(isA<FalhaEditais>().having((f) => f.tipo, 'tipo', TipoFalhaEditais.semConexao)),
      );
      final fora = repositorio((_) async => (503, ''));
      await expectLater(
        fora.ler(FonteEditais.proaes, agora: agora),
        throwsA(isA<FalhaEditais>().having((f) => f.tipo, 'tipo', TipoFalhaEditais.semConexao)),
      );
    });

    test('resposta estranha: naoLi, e o cache antigo continua', () async {
      await repositorio((_) async => (200, texto('proaes_editais.json'))).ler(FonteEditais.proaes, agora: agora);
      final r = repositorio((_) async => (200, '{"nada": true}'));
      await r.carregarGuardados(FonteEditais.proaes);
      for (final corpo in ['{"nada": true}', '<html>', '']) {
        final estranho = repositorio((_) async => (200, corpo));
        await expectLater(
          estranho.ler(FonteEditais.proaes, agora: agora, forcar: true),
          throwsA(isA<FalhaEditais>().having((f) => f.tipo, 'tipo', TipoFalhaEditais.naoLi)),
        );
      }
      expect((await r.carregarGuardados(FonteEditais.proaes))!.lista, hasLength(6));
    });

    test('"Limpar dados salvos" apaga os editais das três pró-reitorias', () async {
      final r = repositorio((u) async => (200, texto('proaes_editais.json')));
      for (final f in FonteEditais.values) {
        await r.ler(f, agora: agora);
      }
      expect(guardados, hasLength(3));
      await r.limparCache();
      expect(guardados, isEmpty);
      for (final f in FonteEditais.values) {
        expect(r.guardados(f), isNull);
      }
    });
  });

  group('datas no formato brasileiro', () {
    final agora = DateTime.utc(2026, 11, 21, 15);
    Edital edital(String? publicado, String? atualizado) => Edital(
      titulo: 'x',
      url: 'https://www3.ufac.br/x',
      publicadoEm: publicado == null ? null : DateTime.parse(publicado),
      atualizadoEm: atualizado == null ? null : DateTime.parse(atualizado),
    );

    test('publicado e atualizado em dias diferentes', () {
      expect(
        rotuloDatas(edital('2026-11-06T22:13:02+00:00', '2026-11-16T14:49:40+00:00'), agora),
        'Publicado em 6 de novembro · atualizado em 16 de novembro',
      );
    });

    test('atualizado no mesmo dia da publicação não repete', () {
      expect(
        rotuloDatas(edital('2026-10-23T14:28:47+00:00', '2026-10-23T20:28:47+00:00'), agora),
        'Publicado em 23 de outubro',
      );
    });

    test('usa o fuso de Rio Branco (3h UTC ainda é o dia anterior)', () {
      expect(rotuloDatas(edital('2026-11-07T03:00:00+00:00', null), agora), 'Publicado em 6 de novembro');
    });

    test('outro ano mostra o ano; só atualização; sem data, nada', () {
      expect(rotuloDatas(edital('2025-12-10T12:00:00+00:00', null), agora), 'Publicado em 10 de dezembro de 2025');
      expect(rotuloDatas(edital(null, '2026-03-02T12:00:00+00:00'), agora), 'Atualizado em 2 de março');
      expect(rotuloDatas(edital(null, null), agora), '');
    });

    test('quantos editais e quando foram lidos', () {
      expect(contagemEditais(1, 2026), '1 edital de 2026');
      expect(contagemEditais(17, 2026), '17 editais de 2026');
      final lido = DateTime(2026, 11, 21, 9, 40);
      expect(rotuloLidoEm(lido, DateTime(2026, 11, 21, 14)), 'Atualizado às 9h40');
      expect(rotuloLidoEm(lido, DateTime(2026, 11, 22, 8)), 'Atualizado em 21/11 às 9h40');
    });
  });
}
