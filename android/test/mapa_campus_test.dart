import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/config.dart';

// Atalho "Mapa do campus" do Menu: mesmo endereço e rótulo do iPhone, só https, aberto sem sair do app.
void main() {
  group('Mapa do campus', () {
    test('endereço é https e é o mesmo do iPhone', () {
      final uri = Uri.parse(urlMapaCampus);
      expect(uri.scheme, 'https');
      expect(uri.host, 'sistemas.ufac.br');
      expect(urlMapaCampus, 'https://sistemas.ufac.br/mapa/');
    });

    test('iPhone usa o mesmo endereço (quando a pasta do iPhone está no checkout)', () {
      final iphone = File('../iphone/web/src/telas/menu.js');
      if (!iphone.existsSync()) return;
      final fonte = iphone.readAsStringSync();
      expect(fonte, contains("URL_MAPA_CAMPUS = '$urlMapaCampus'"));
      expect(fonte, contains('Mapa do campus'));
    });

    test('o Menu tem o cartão com o rótulo do iPhone e usa a URL da configuração', () {
      final menu = File('lib/screens/menu.dart').readAsStringSync();
      expect(menu, contains("'Mapa do campus'"));
      expect(menu, contains('urlMapaCampus'));
      // Aba do Chrome por cima do app (fluida para o mapa); a página interna fica de reserva.
      expect(menu, contains('LaunchMode.inAppBrowserView'));
      expect(menu, contains('TelaSiteOficial('));
      expect(menu, isNot(contains('LaunchMode.externalApplication')));
      expect(menu, isNot(contains('sistemas.ufac.br/mapa')));
    });
  });
}
