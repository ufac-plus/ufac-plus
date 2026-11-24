import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/main.dart';
import 'package:ufac_no_bolso/session/regras_sessao.dart';
import 'package:ufac_no_bolso/session/sessao.dart';

void main() {
  group('classificar', () {
    EstadoPagina portal(String u) => classificar(Sistema.portal, Uri.parse(u));
    EstadoPagina eticket(String u) => classificar(Sistema.eticket, Uri.parse(u));

    test('portal', () {
      expect(portal('https://portal.ufac.br/aluno/index.action'), EstadoPagina.logado);
      expect(portal('https://portal.ufac.br/aluno/login.action;jsessionid=ABC?error='), EstadoPagina.naLogin);
      expect(portal('https://portal.ufac.br/aluno/logout.action'), EstadoPagina.naLogin);
      expect(portal('https://portal.ufac.br/aluno/j_security_check'), EstadoPagina.outra);
      expect(portal('https://portal.ufac.br/usuario/publico/usuario/recuperacaosenha.action'), EstadoPagina.outra);
    });

    test('eticket', () {
      expect(eticket('https://sistemas.ufac.br/eticket/'), EstadoPagina.logado);
      expect(eticket('https://sistemas.ufac.br/eticket/login/?next=/eticket/'), EstadoPagina.naLogin);
      expect(eticket('https://sistemas.ufac.br/eticket/menuExterno/'), EstadoPagina.outra);
      expect(eticket('https://sistemas.ufac.br/home/servicos/idufac/'), EstadoPagina.outra);
    });
  });

  group('navegacao', () {
    test('http da Ufac vira https; de fora nao', () {
      expect(versaoHttps(Uri.parse('http://portal.ufac.br/aluno/index.action;jsessionid=A'))?.scheme, 'https');
      expect(versaoHttps(Uri.parse('http://exemplo.com/')), isNull);
      expect(versaoHttps(Uri.parse('https://portal.ufac.br/')), isNull);
    });
    test('so sites da Ufac', () {
      expect(ehSiteDaUfac(Uri.parse('https://sistemas.ufac.br/x')), isTrue);
      expect(ehSiteDaUfac(Uri.parse('https://ufac.br.exemplo.com/')), isFalse);
      expect(ehSiteDaUfac(Uri.parse('https://naoufac.br/')), isFalse);
    });
  });

  // Issue #3: o eTICKET às vezes não responde (metade das conexões novas no 200.129.173.36) ou entrega o
  // certificado errado (200.129.173.8). Cada nova tentativa abre uma WebView nova, com conexão nova.
  group('eTICKET instavel (issue #3)', () {
    const ativa = PaginaLida(ResultadoVerificacao.ativa, '<html></html>');

    test('repete com conexao nova quando a tentativa nao teve resposta', () async {
      var vezes = 0;
      final r = await comNovasTentativas(
        () async => ++vezes < 3 ? const PaginaLida.falhaDeRede() : ativa,
        vezes: 3,
        espera: Duration.zero,
      );
      expect(vezes, 3);
      expect(r.resultado, ResultadoVerificacao.ativa);
    });

    test('desiste depois do limite, sem marcar a sessao como expirada', () async {
      var vezes = 0;
      final r = await comNovasTentativas(
        () async {
          vezes++;
          return const PaginaLida.falhaDeRede();
        },
        vezes: 3,
        espera: Duration.zero,
      );
      expect(vezes, 3);
      expect(r.resultado, ResultadoVerificacao.semResposta);
    });

    test('nao repete o que nao e falha de rede (login enviado, sessao caida, pagina inesperada)', () async {
      for (final p in [
        const PaginaLida(ResultadoVerificacao.expirada),
        const PaginaLida(ResultadoVerificacao.semResposta), // ex.: depois de enviar o login automático
        ativa,
      ]) {
        var vezes = 0;
        final r = await comNovasTentativas(
          () async {
            vezes++;
            return p;
          },
          vezes: 3,
          espera: Duration.zero,
        );
        expect(vezes, 1);
        expect(r.resultado, p.resultado);
      }
    });

    test('espera um pouco entre as tentativas', () async {
      var vezes = 0;
      final relogio = Stopwatch()..start();
      await comNovasTentativas(
        () async {
          vezes++;
          return const PaginaLida.falhaDeRede();
        },
        vezes: 3,
        espera: const Duration(milliseconds: 60),
      );
      expect(vezes, 3);
      expect(relogio.elapsedMilliseconds, greaterThanOrEqualTo(120));
    });

    test('so o eTICKET repete, com prazos curtos; o Portal segue com uma tentativa', () {
      final eticket = prazosDasTentativas(Sistema.eticket);
      expect(eticket.length, greaterThan(1));
      expect(eticket.every((p) => p <= const Duration(seconds: 8)), isTrue);
      // Somando as esperas, não passa muito do limite que já existia (20 s), como os 25 s do iPhone.
      final total = eticket.fold(Duration.zero, (a, b) => a + b) + esperaEntreTentativas * (eticket.length - 1);
      expect(total, lessThanOrEqualTo(const Duration(seconds: 25)));
      expect(prazosDasTentativas(Sistema.portal), [const Duration(seconds: 20)]);
    });

    test('certificado errado do proprio site encerra a tentativa (nunca aceita)', () {
      final pagina = Uri.parse('https://sistemas.ufac.br/eticket/');
      expect(certificadoDaPagina(pagina, 'sistemas.ufac.br'), isTrue);
      expect(certificadoDaPagina(pagina, 'cdn.exemplo.com'), isFalse);
      expect(certificadoDaPagina(pagina, null), isTrue);
    });
  });

  test('sem resposta nao conta como sessao expirada', () async {
    final s = Sessao.instancia;
    s.leitor = (sistema, _) async =>
        PaginaLida(sistema == Sistema.eticket ? ResultadoVerificacao.expirada : ResultadoVerificacao.semResposta);
    await s.verificar();
    expect(s.expirados, {Sistema.eticket});
  });

  testWidgets('boas-vindas mostra o aviso de app independente', (tester) async {
    await tester.pumpWidget(const UfacNoBolso(loginConcluido: false));
    expect(find.text('Sou aluno'), findsOneWidget);
    expect(find.text('Sou professor'), findsOneWidget);
    expect(find.textContaining('Não é um aplicativo oficial da Ufac'), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(find.byType(NavigationBar), findsNothing);
  });
}
