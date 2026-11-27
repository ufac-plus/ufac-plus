// O que o Android trouxe do iPhone 1.8: horas complementares e monitoria nos Editais, aviso de monitoria
// sem servidor, "Saldo baixo" no RU (#14) e as correções da Biblioteca (#8).
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/aviso_monitoria.dart';
import 'package:ufac_no_bolso/data/banco.dart';
import 'package:ufac_no_bolso/data/editais.dart';
import 'package:ufac_no_bolso/data/editais_horas.dart';
import 'package:ufac_no_bolso/data/preferencias.dart';
import 'package:ufac_no_bolso/extractors/biblioteca.dart';
import 'package:ufac_no_bolso/screens/ru.dart';
import 'package:ufac_no_bolso/session/regras_sessao.dart';

Edital ed(String titulo, [String descricao = '']) =>
    Edital(titulo: titulo, url: 'https://www3.ufac.br/prograd/2026/${titulo.hashCode}', descricao: descricao);

/// Resposta da busca do Plone com estes títulos (mais novo primeiro).
String plone(List<String> titulos) => jsonEncode({
  'items': [
    for (final t in titulos)
      {'@id': 'https://www3.ufac.br/prograd/2026/${t.hashCode}', '@type': 'Folder', 'title': t, 'description': ''},
  ],
});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    Banco.memoria = {};
  });

  group('horas complementares (igual ao iPhone)', () {
    test('monitoria: faixa da categoria, sempre estimativa', () {
      final h = horasComplementares(ed('Edital Prograd nº 50/2026 - Seleção de monitores'))!;
      expect(h.categoria, 'Monitoria');
      expect(h.rotulo, '~30 a 60 h complementares por semestre');
      expect(h.estimado, isTrue);
    });
    test('horas escritas no edital valem mais', () {
      final h = horasComplementares(ed('Curso de extensão em Libras', 'Certificado de 40 h para os concluintes'))!;
      expect(h.horas, 40);
      expect(h.rotulo, '40 h complementares');
      expect(h.estimado, isFalse);
    });
    test('"horas semanais" é dedicação, não o total do certificado', () {
      final h = horasComplementares(ed('Seleção de bolsistas', 'carga horária de 12 h semanais'))!;
      expect(h.horas, isNull);
      expect(h.estimado, isTrue);
    });
    test('auxílios e cadastros não rendem horas', () {
      expect(horasComplementares(ed('Auxílio moradia 2026')), isNull);
      expect(horasComplementares(ed('Vagas residuais 2026/2')), isNull);
    });
    test('edital de monitoria pelo título, descrição ou endereço', () {
      expect(ehEditalMonitoria(ed('Promaed 2026')), isTrue);
      expect(ehEditalMonitoria(ed('Edital de transporte')), isFalse);
    });
  });

  group('aviso de monitoria (sem servidor: confere ao abrir o app)', () {
    test('desligado não lê nada; ligado marca o que existe e só avisa o que é novo', () async {
      var titulos = ['Edital 1/2026 - Monitoria de Cálculo', 'Edital 2/2026 - Transporte'];
      var pedidos = 0;
      final editais = RepositorioEditais(
        buscar: (_) async {
          pedidos++;
          return (200, plone(titulos));
        },
      );
      final aviso = AvisoMonitoria(editais: editais);
      await Preferencias.instancia.carregar();
      await aviso.conferir();
      expect(pedidos, 0, reason: 'aviso desligado');

      await aviso.ligar(true);
      expect(aviso.novo, isNull, reason: 'a 1ª leitura só marca o que já existe');

      titulos = ['Edital 3/2026 - Seleção de monitores', ...titulos];
      final depois = DateTime.now().add(const Duration(hours: 7));
      await aviso.conferir(agora: depois);
      expect(aviso.novo?.titulo, 'Edital 3/2026 - Seleção de monitores');

      aviso.dispensar();
      await aviso.conferir(agora: depois.add(const Duration(hours: 7)));
      expect(aviso.novo, isNull, reason: 'o mesmo edital não avisa duas vezes');
      await aviso.ligar(false);
    });
  });

  test('saldo baixo com R\$ 2,00 ou menos', () {
    expect(saldoBaixo(2.0), isTrue);
    expect(saldoBaixo(1.5), isTrue);
    expect(saldoBaixo(2.01), isFalse);
  });

  group('Biblioteca (#8)', () {
    test('sem empréstimos o site manda rows: null: é lista vazia', () {
      expect(lerHistoricoBiblioteca('{"rows": null, "total": 0}'), isEmpty);
      expect(lerHistoricoBiblioteca('{"outra": 1}'), isNull);
    });
    test('o logout da Biblioteca nunca é seguido (derruba a sessão do Portal)', () {
      expect(sairDaBiblioteca(Uri.parse('https://portal.ufac.br/biblioteca/logout.action')), isTrue);
      expect(sairDaBiblioteca(Uri.parse('https://portal.ufac.br/biblioteca/usuario/index.action')), isFalse);
    });
  });
}
