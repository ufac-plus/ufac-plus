// Editais da Proaes (bolsas e auxílios), da Prograd (graduação) e da Proex (extensão e cultura).
// A listagem é pública: a API do site da Ufac (www3.ufac.br, Plone) responde sem login e sem cookies.
// Respeito à Ufac: lê só ao abrir a tela ou puxar para atualizar, e guarda por 6 horas.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../extractors/editais.dart';
import '../ui/formatos.dart';
import 'banco.dart';

export '../extractors/editais.dart' show Edital, linkDaUfac;

enum FonteEditais {
  proaes('Proaes', 'Bolsas e auxílios estudantis'),
  prograd('Prograd', 'Monitoria, vagas residuais e outros'),
  proex('Proex', 'Extensão, cultura e esporte');

  const FonteEditais(this.nome, this.sobre);
  final String nome, sobre;
}

const validadeEditais = Duration(hours: 6);
const _porPedido = 100; // um ano inteiro cabe num pedido (17 a 50 editais por ano)

Uri enderecoPasta(FonteEditais fonte, int ano) => Uri.https('www3.ufac.br', '/${fonte.name}/$ano');

Uri enderecoBusca(FonteEditais fonte, int ano) => Uri.https('www3.ufac.br', '/${fonte.name}/@search', {
  'path.query': '/${fonte.name}/$ano',
  'path.depth': '1',
  'sort_on': 'effective',
  'sort_order': 'descending',
  'b_size': '$_porPedido',
  'metadata_fields': ['effective', 'modified'],
});

/// Rio Branco fica em UTC−5 o ano todo (o Acre não tem horário de verão).
DateTime _emRioBranco(DateTime d) => d.toUtc().subtract(const Duration(hours: 5));

bool _mesmoDia(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// "Publicado em 6 de novembro · atualizado em 16 de novembro" (a atualização costuma ser um resultado novo).
String rotuloDatas(Edital e, DateTime agora) {
  final ano = _emRioBranco(agora).year;
  final publicado = e.publicadoEm == null ? null : _emRioBranco(e.publicadoEm!);
  final atualizado = e.atualizadoEm == null ? null : _emRioBranco(e.atualizadoEm!);
  final partes = <String>[];
  if (publicado != null) partes.add('Publicado em ${formatarDiaMes(publicado, anoAtual: ano)}');
  if (atualizado != null &&
      (publicado == null || (atualizado.isAfter(publicado) && !_mesmoDia(atualizado, publicado)))) {
    partes.add('${partes.isEmpty ? 'Atualizado' : 'atualizado'} em ${formatarDiaMes(atualizado, anoAtual: ano)}');
  }
  return partes.join(' · ');
}

String contagemEditais(int n, int ano) => '${n == 1 ? '1 edital' : '$n editais'} de $ano';

/// "Atualizado às 9h40" (hoje) ou "Atualizado em 21/11 às 9h40".
String rotuloLidoEm(DateTime lidoEm, DateTime agora) => _mesmoDia(lidoEm, agora)
    ? 'Atualizado às ${formatarHora(lidoEm.hour, lidoEm.minute)}'
    : 'Atualizado em ${formatarDiaHora(lidoEm)}';

class EditaisLidos {
  const EditaisLidos({required this.ano, required this.lidoEm, required this.lista});

  final int ano;
  final DateTime lidoEm;
  final List<Edital> lista;

  Map<String, dynamic> paraMapa() => {
    'ano': ano,
    'lidoEm': lidoEm.toIso8601String(),
    'lista': [for (final e in lista) e.paraMapa()],
  };

  factory EditaisLidos.deMapa(Map<String, dynamic> m) => EditaisLidos(
    ano: m['ano'] as int,
    lidoEm: DateTime.parse(m['lidoEm'] as String),
    lista: [for (final e in m['lista'] as List) Edital.deMapa(e as Map<String, dynamic>)],
  );
}

enum TipoFalhaEditais { semConexao, naoLi }

class FalhaEditais implements Exception {
  const FalhaEditais(this.tipo);
  final TipoFalhaEditais tipo;
}

/// Pede a listagem sem cookies (o HttpClient do Dart não guarda nenhum) e devolve (status, corpo).
Future<(int, String)> _buscarNaUfac(Uri endereco) async {
  final cliente = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  try {
    final pedido = await cliente.getUrl(endereco);
    pedido.headers.set(HttpHeaders.acceptHeader, 'application/json');
    final resposta = await pedido.close().timeout(const Duration(seconds: 20));
    final corpo = await resposta.transform(utf8.decoder).join().timeout(const Duration(seconds: 20));
    return (resposta.statusCode, corpo);
  } finally {
    cliente.close(force: true);
  }
}

class RepositorioEditais {
  RepositorioEditais({
    Future<(int, String)> Function(Uri)? buscar,
    Future<String?> Function(String)? lerGuardado,
    Future<void> Function(String, String)? gravar,
    Future<void> Function(String)? apagar,
  }) : _buscar = buscar ?? _buscarNaUfac,
       _lerGuardado = lerGuardado ?? Banco.ler,
       _gravar = gravar ?? Banco.gravar,
       _apagar = apagar ?? Banco.apagar;

  static final instancia = RepositorioEditais();

  final Future<(int, String)> Function(Uri) _buscar;
  final Future<String?> Function(String) _lerGuardado;
  final Future<void> Function(String, String) _gravar;
  final Future<void> Function(String) _apagar;

  final _memoria = <FonteEditais, EditaisLidos>{};

  static String _chave(FonteEditais f) => 'editais_${f.name}_v1';

  /// O que já foi lido (mesmo vencido), para mostrar enquanto atualiza ou quando a Ufac não responde.
  EditaisLidos? guardados(FonteEditais f) => _memoria[f];

  Future<EditaisLidos?> carregarGuardados(FonteEditais f) async {
    if (_memoria[f] != null) return _memoria[f];
    final texto = await _lerGuardado(_chave(f));
    if (texto == null) return null;
    try {
      return _memoria[f] = EditaisLidos.deMapa(jsonDecode(texto) as Map<String, dynamic>);
    } catch (_) {
      return null; // formato antigo: lê de novo
    }
  }

  Future<List<Edital>> _lerAno(FonteEditais f, int ano) async {
    final int status;
    final String corpo;
    try {
      (status, corpo) = await _buscar(enderecoBusca(f, ano));
    } on IOException {
      throw const FalhaEditais(TipoFalhaEditais.semConexao);
    } on TimeoutException {
      throw const FalhaEditais(TipoFalhaEditais.semConexao);
    }
    if (status >= 400) throw const FalhaEditais(TipoFalhaEditais.semConexao);
    List<Edital>? lista;
    try {
      lista = lerEditais(jsonDecode(corpo));
    } on FormatException {
      lista = null;
    }
    if (lista == null) throw const FalhaEditais(TipoFalhaEditais.naoLi);
    return lista;
  }

  /// Editais do ano. No começo do ano, enquanto a pasta nova está vazia, mostra os do ano anterior.
  /// Lança [FalhaEditais] (o cache antigo fica intacto).
  Future<EditaisLidos> ler(FonteEditais f, {bool forcar = false, DateTime? agora}) async {
    final momento = agora ?? DateTime.now();
    final guardado = await carregarGuardados(f);
    if (!forcar && guardado != null && momento.difference(guardado.lidoEm).abs() < validadeEditais) return guardado;
    var ano = _emRioBranco(momento).year;
    var lista = await _lerAno(f, ano);
    if (lista.isEmpty) lista = await _lerAno(f, --ano);
    final lidos = EditaisLidos(ano: ano, lidoEm: momento, lista: lista);
    _memoria[f] = lidos;
    await _gravar(_chave(f), jsonEncode(lidos.paraMapa()));
    return lidos;
  }

  /// Para "Limpar dados salvos": tudo é lido de novo da Ufac na próxima abertura.
  Future<void> limparCache() async {
    _memoria.clear();
    for (final f in FonteEditais.values) {
      await _apagar(_chave(f));
    }
  }
}
