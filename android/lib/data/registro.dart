// Registro de eventos para o "Relatar um problema" (igual ao iPhone 1.2): fica só neste celular e só sai
// quando a pessoa envia o relato. Guarda o que deu errado (leitura, login), nunca senha, cookie, HTML,
// nome, CPF, matrícula ou número do QR: tudo passa por `anonimizar` antes de ser guardado.
import 'dart:convert';

import 'banco.dart';

/// Tira o que pode identificar a pessoa: CPF com pontos, e-mails e números longos (CPF, matrícula, id interno).
String anonimizar(Object? texto) {
  var t = '${texto ?? ''}'
      .replaceAll(RegExp(r'\d{3}\.\d{3}\.\d{3}-\d{2}'), '#')
      .replaceAll(RegExp(r'[\w.+-]+@[\w-]+\.[\w.]+'), '@')
      .replaceAll(RegExp(r'\d{4,}'), '#')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (t.length > 200) t = t.substring(0, 200);
  return t;
}

/// Endereço sem servidor nem parâmetros: "https://portal.ufac.br/aluno/nota.action?matricula=123" vira "/aluno/nota.action".
String semParametros(Object? endereco) =>
    anonimizar('${endereco ?? ''}'.replaceFirst(RegExp(r'^https?://[^/]+'), '').split(RegExp(r'[?#;]')).first);

class Evento {
  const Evento(this.em, this.tipo, this.dados);
  final DateTime em;
  final String tipo;
  final Map<String, String> dados;

  Map<String, Object> paraMapa() => {'em': em.toIso8601String(), 'tipo': tipo, 'd': dados};

  static Evento deMapa(Map<String, dynamic> m) => Evento(
    DateTime.parse(m['em'] as String),
    m['tipo'] as String,
    (m['d'] as Map).map((k, v) => MapEntry('$k', '$v')),
  );

  String get linha {
    String p(int n) => n.toString().padLeft(2, '0');
    final quando = '${p(em.day)}/${p(em.month)} ${p(em.hour)}:${p(em.minute)}';
    return '$quando $tipo ${dados.entries.map((e) => '${e.key}=${e.value}').join(' ')}'.trim();
  }
}

class Registro {
  Registro._();
  static final instancia = Registro._();

  static const _chave = 'registro_v1';
  static const maximo = 60;

  List<Evento>? _lista;
  Future<void> _fila = Future.value();

  Future<List<Evento>> eventos() async {
    if (_lista != null) return _lista!;
    try {
      final texto = await Banco.ler(_chave);
      _lista = texto == null
          ? []
          : [for (final e in jsonDecode(texto) as List) Evento.deMapa(e as Map<String, dynamic>)];
    } catch (_) {
      _lista = [];
    }
    return _lista!;
  }

  /// tipo: 'leitura' | 'login' | 'app'. Nunca lança: registrar não pode quebrar o app.
  Future<void> registrar(String tipo, Map<String, Object?> dados) {
    final limpos = <String, String>{
      for (final e in dados.entries)
        if (e.value != null && '${e.value}'.isNotEmpty) e.key: anonimizar(e.value),
    };
    _fila = _fila.then((_) async {
      final lista = await eventos();
      lista.add(Evento(DateTime.now(), tipo, limpos));
      if (lista.length > maximo) lista.removeRange(0, lista.length - maximo);
      await Banco.gravar(_chave, jsonEncode([for (final e in lista) e.paraMapa()]));
    }).catchError((_) {});
    return _fila;
  }

  Future<void> limpar() async {
    _lista = [];
    try {
      await Banco.gravar(_chave, '[]');
    } catch (_) {}
  }
}
