import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'credenciais.dart';
import 'regras_sessao.dart';

enum ResultadoVerificacao { ativa, expirada, semResposta }

/// Página aberta em segundo plano. O HTML só existe com sessão ativa e nunca vai para log.
class PaginaLida {
  const PaginaLida(this.resultado, [this.html]) : repetivel = false;

  /// O site não respondeu a tempo ou mostrou o certificado errado, antes de qualquer login enviado:
  /// pode ser repetida com uma conexão nova.
  const PaginaLida.falhaDeRede() : resultado = ResultadoVerificacao.semResposta, html = null, repetivel = true;

  final ResultadoVerificacao resultado;
  final String? html;
  final bool repetivel;
}

// Issue #3: o eTICKET tem dois IPs; um entrega o certificado do portal e, no outro, cerca de metade das
// conexões novas nunca recebe resposta (as boas respondem em ~0,35 s). O iPhone repete cada salto no Worker;
// aqui cada tentativa é uma WebView nova, com conexão nova, e prazo curto. O Portal não repete (como no iPhone).
const esperaEntreTentativas = Duration(seconds: 1);

List<Duration> prazosDasTentativas(Sistema sistema) => sistema == Sistema.eticket
    ? const [Duration(seconds: 7), Duration(seconds: 7), Duration(seconds: 7)]
    : const [Duration(seconds: 20)];

/// Repete [tentar] enquanto a falha for de rede, até [vezes], com [espera] entre uma e outra.
Future<PaginaLida> comNovasTentativas(
  Future<PaginaLida> Function() tentar, {
  required int vezes,
  Duration espera = esperaEntreTentativas,
}) async {
  var pagina = await tentar();
  for (var i = 1; i < vezes && pagina.repetivel; i++) {
    await Future<void>.delayed(espera);
    pagina = await tentar();
  }
  return pagina;
}

/// O certificado recusado é o do próprio site pedido (e não de um recurso de outro endereço)?
/// Em qualquer caso a resposta ao Android é sempre recusar: nunca se aceita certificado inválido.
bool certificadoDaPagina(Uri pagina, String? host) => host == null || host == pagina.host;

typedef Leitor = Future<PaginaLida> Function(Sistema sistema, String url);

/// Estado do login. A senha nunca passa por aqui: só existem os cookies da WebView
/// e a marca de que a pessoa já entrou.
class Sessao extends ChangeNotifier {
  Sessao._();
  static final instancia = Sessao._();

  static const _chaveLogin = 'login_concluido';
  static const _cofre = FlutterSecureStorage();

  /// Substituído nos testes, onde não existe WebView.
  Leitor leitor = _lerComWebView;

  final Set<Sistema> _expirados = {};
  Set<Sistema> get expirados => _expirados;

  /// Sistemas que a pessoa escolheu não conectar (ex.: só usa o RU, ou não usa o RU).
  /// O app não lê nada deles e mostra um botão "Conectar" no lugar dos dados.
  static const _chavePulados = 'sistemas_pulados';
  final Set<Sistema> _pulados = {};

  bool conectado(Sistema sistema) => !_pulados.contains(sistema);

  Future<void> carregarPulados() async {
    final salvo = await _cofre.read(key: _chavePulados) ?? '';
    _pulados
      ..clear()
      ..addAll(Sistema.values.where((s) => salvo.split(',').contains(s.name)));
  }

  Future<void> _gravarPulados() => _cofre.write(key: _chavePulados, value: _pulados.map((s) => s.name).join(','));

  Future<void> pular(Sistema sistema) async {
    _pulados.add(sistema);
    _expirados.remove(sistema);
    await _gravarPulados();
    notifyListeners();
  }

  /// Chamado a cada login que deu certo naquele sistema.
  Future<void> conectar(Sistema sistema) async {
    if (!_pulados.remove(sistema)) return;
    await _gravarPulados();
    notifyListeners();
  }

  Future<bool> loginConcluido() async => await _cofre.read(key: _chaveLogin) == 'sim';

  Future<void> concluirLogin() async {
    await _cofre.write(key: _chaveLogin, value: 'sim');
    _expirados.clear();
    notifyListeners();
  }

  /// Lê uma página de um sistema e atualiza o aviso. Sem internet não é sessão expirada.
  Future<PaginaLida> lerEMarcar(Sistema sistema, {String? url}) async {
    final pagina = await leitor(sistema, url ?? sistema.entrada);
    if (pagina.resultado == ResultadoVerificacao.expirada) {
      _expirados.add(sistema);
    } else if (pagina.resultado == ResultadoVerificacao.ativa) {
      _expirados.remove(sistema);
    }
    notifyListeners();
    return pagina;
  }

  /// Roda ao abrir o app. Só o eTICKET: traz saldo e QR. A sessão do portal cai em menos
  /// de 1 hora, então ela só é conferida quando alguma tela precisa dele.
  Future<PaginaLida> verificar() async =>
      conectado(Sistema.eticket) ? lerEMarcar(Sistema.eticket) : const PaginaLida(ResultadoVerificacao.semResposta);

  /// Apaga sessão, número do QR e tudo que está no armazenamento seguro deste celular.
  Future<void> sair() async {
    await CookieManager.instance().deleteAllCookies();
    await _cofre.deleteAll(); // inclui CPF e senha do login automático
    Credenciais.instancia.limparMemoria();
    _expirados.clear();
    _pulados.clear();
    notifyListeners();
  }
}

Future<PaginaLida> _lerComWebView(Sistema sistema, String endereco) async {
  // Login automático: no máximo uma tentativa por leitura, só com senha guardada pela pessoa. Uma tentativa
  // que enviou o login nunca é repetida, então a senha não vai duas vezes.
  final login = await Credenciais.instancia.paraLoginAutomatico();
  final prazos = prazosDasTentativas(sistema);
  var vez = 0;
  return comNovasTentativas(() => _umaLeitura(sistema, endereco, login, prazos[vez++]), vezes: prazos.length);
}

/// Prazo extra depois de enviar o login automático (envio, redirecionamento e volta à página pedida).
const _prazoDoLogin = Duration(seconds: 20);

Future<PaginaLida> _umaLeitura(Sistema sistema, String endereco, (String, String)? login, Duration prazo) async {
  final fim = Completer<PaginaLida>();
  void concluir(PaginaLida p) {
    if (!fim.isCompleted) fim.complete(p);
  }

  var tentouLogin = false, recarregou = false;
  // Sem resposta: repetível só se o login ainda não foi enviado.
  PaginaLida semResposta() =>
      tentouLogin ? const PaginaLida(ResultadoVerificacao.semResposta) : const PaginaLida.falhaDeRede();
  var relogio = Timer(prazo, () => concluir(semResposta()));
  final webview = HeadlessInAppWebView(
    initialUrlRequest: URLRequest(url: WebUri(endereco)),
    initialSettings: InAppWebViewSettings(useShouldOverrideUrlLoading: true),
    shouldOverrideUrlLoading: (controle, acao) async {
      final destino = acao.request.url;
      final https = destino == null ? null : versaoHttps(destino);
      if (https == null) return NavigationActionPolicy.ALLOW;
      await controle.loadUrl(urlRequest: URLRequest(url: WebUri.uri(https)));
      return NavigationActionPolicy.CANCEL;
    },
    // Certificado errado (um dos IPs do eTICKET entrega o do portal): recusa sempre. Sem isto, o Android recusa
    // em silêncio e a página de erro chegava ao onLoadStop com o endereço do eTICKET, como se estivesse logado.
    onReceivedServerTrustAuthRequest: (_, desafio) async {
      if (certificadoDaPagina(Uri.parse(endereco), desafio.protectionSpace.host)) concluir(semResposta());
      return ServerTrustAuthResponse(action: ServerTrustAuthResponseAction.CANCEL);
    },
    onLoadStop: (controle, url) async {
      if (fim.isCompleted || url == null || url.scheme != 'https') return;
      switch (classificar(sistema, url)) {
        case EstadoPagina.logado:
          // Depois do login automático, o site pode cair na página inicial: volta para a pedida.
          if (tentouLogin && !recarregou) {
            recarregou = true;
            await controle.loadUrl(urlRequest: URLRequest(url: WebUri(endereco)));
            return;
          }
          concluir(PaginaLida(ResultadoVerificacao.ativa, await controle.getHtml()));
        case EstadoPagina.naLogin:
          if (login != null && !tentouLogin) {
            tentouLogin = true;
            relogio.cancel();
            relogio = Timer(_prazoDoLogin, () => concluir(semResposta()));
            final r = await controle.evaluateJavascript(
              source: scriptLoginAutomatico(eticket: sistema == Sistema.eticket, cpf: login.$1, senha: login.$2),
            );
            if (r == 'enviado') return; // espera a próxima página
            concluir(const PaginaLida(ResultadoVerificacao.expirada));
            return;
          }
          // Já tentou e voltou para o login: senha recusada (ou mudou). Para de tentar.
          if (tentouLogin) Credenciais.instancia.falhou = true;
          concluir(const PaginaLida(ResultadoVerificacao.expirada));
        case EstadoPagina.outra:
          concluir(const PaginaLida(ResultadoVerificacao.semResposta));
      }
    },
    onReceivedError: (_, pedido, erro) {
      if (pedido.isForMainFrame == true && erro.type != WebResourceErrorType.CANCELLED) concluir(semResposta());
    },
  );
  try {
    await webview.run();
    return await fim.future;
  } finally {
    relogio.cancel();
    await webview.dispose();
  }
}
