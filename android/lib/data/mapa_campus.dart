// Mapa do campus feito pelo próprio app. O site oficial (sistemas.ufac.br/mapa) é pesado no celular,
// então o app lê só a lista pública de prédios (sem login, sem cookies) e desenha o mapa.
// Respeito à Ufac: lê ao abrir a tela, guarda por 7 dias e usa o que tem salvo se a Ufac não responder.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'banco.dart';

const urlLocaisCampus = 'https://sistemas.ufac.br/mapa/api/locais/?campus=SEDE';

/// Centro e zoom do Campus Sede, os mesmos do site oficial.
const centroCampusSede = (-9.955, -67.865);
const zoomCampusSede = 16.0;

class LocalCampus {
  const LocalCampus({
    required this.codigo,
    required this.titulo,
    required this.latitude,
    required this.longitude,
    this.setor,
    this.horario,
    this.descricao,
    this.categoria,
    this.rampa = false,
    this.elevador = false,
    this.banheiroPcd = false,
    this.pisoTatil = false,
  });

  /// Código do prédio no campus (ex.: "A05").
  final String codigo;
  final String titulo;
  final double latitude, longitude;
  final String? setor, horario, descricao, categoria;
  final bool rampa, elevador, banheiroPcd, pisoTatil;

  List<String> get acessibilidade => [
    if (rampa) 'Rampa',
    if (elevador) 'Elevador',
    if (banheiroPcd) 'Banheiro PcD',
    if (pisoTatil) 'Piso tátil',
  ];

  /// Busca sem acento e sem maiúscula, pelo nome, código, setor ou tipo.
  bool combina(String termo) {
    final t = _semAcento(termo.trim().toLowerCase());
    if (t.isEmpty) return true;
    return [
      codigo,
      titulo,
      setor ?? '',
      categoria ?? '',
      descricao ?? '',
    ].any((c) => _semAcento(c.toLowerCase()).contains(t));
  }

  Map<String, Object?> paraMapa() => {
    'c': codigo,
    't': titulo,
    'la': latitude,
    'lo': longitude,
    's': setor,
    'h': horario,
    'd': descricao,
    'k': categoria,
    'a': [rampa, elevador, banheiroPcd, pisoTatil],
  };

  static LocalCampus deMapa(Map<String, dynamic> m) {
    final a = (m['a'] as List).cast<bool>();
    return LocalCampus(
      codigo: m['c'] as String,
      titulo: m['t'] as String,
      latitude: (m['la'] as num).toDouble(),
      longitude: (m['lo'] as num).toDouble(),
      setor: m['s'] as String?,
      horario: m['h'] as String?,
      descricao: m['d'] as String?,
      categoria: m['k'] as String?,
      rampa: a[0],
      elevador: a[1],
      banheiroPcd: a[2],
      pisoTatil: a[3],
    );
  }
}

String _semAcento(String s) {
  const de = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const para = 'aaaaaeeeeiiiiooooouuuuc';
  final b = StringBuffer();
  for (final ch in s.split('')) {
    final i = de.indexOf(ch);
    b.write(i < 0 ? ch : para[i]);
  }
  return b.toString();
}

String? _texto(Object? v) {
  final t = (v ?? '').toString().replaceAll(RegExp(r'\s+'), ' ').trim();
  return t.isEmpty ? null : t;
}

/// "ALMOXARIFADO." vira "Almoxarifado". Descrição igual ao título (só em maiúsculas) não vale a pena mostrar.
String? _descricaoUtil(Object? v, String titulo) {
  final t = _texto(v)?.replaceAll(RegExp(r'\.$'), '');
  if (t == null) return null;
  if (_semAcento(t.toLowerCase()) == _semAcento(titulo.toLowerCase())) return null;
  return t == t.toUpperCase() ? '${t[0]}${t.substring(1).toLowerCase()}' : t;
}

/// Lista pública de prédios do mapa. Null se a resposta não for a lista; quem não tem coordenada fica de fora.
List<LocalCampus>? lerLocaisCampus(String resposta) {
  try {
    final j = jsonDecode(resposta);
    if (j is! Map || j['locais'] is! List) return null;
    final lista = <LocalCampus>[];
    for (final l in j['locais'] as List) {
      if (l is! Map) continue;
      final lat = l['latitude'], lng = l['longitude'];
      final codigo = _texto(l['codigo']), titulo = _texto(l['titulo']);
      if (lat is! num || lng is! num || codigo == null || titulo == null) continue;
      final cat = l['categoria'], ac = l['acessibilidade'];
      bool flag(String k) => ac is Map && ac[k] == true;
      lista.add(
        LocalCampus(
          codigo: codigo,
          titulo: titulo,
          latitude: lat.toDouble(),
          longitude: lng.toDouble(),
          setor: _texto(l['subtitulo']),
          horario: _texto(l['horario'])?.replaceAll(' as ', ' às '),
          descricao: _descricaoUtil(l['descricao'], titulo),
          categoria: cat is Map ? _texto(cat['nome']) : null,
          rampa: flag('rampa'),
          elevador: flag('elevador'),
          banheiroPcd: flag('banheiro_pcd'),
          pisoTatil: flag('piso_tatile'),
        ),
      );
    }
    lista.sort((a, b) => a.codigo.compareTo(b.codigo));
    return lista;
  } on FormatException {
    return null;
  }
}

/// O servidor sistemas.ufac.br às vezes não responde na primeira (issue #3): tenta até 3 vezes, com prazos curtos.
Future<String?> _buscarLocais() async {
  for (var tentativa = 0; tentativa < 3; tentativa++) {
    final cliente = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final pedido = await cliente.getUrl(Uri.parse(urlLocaisCampus));
      pedido.headers.set(HttpHeaders.acceptHeader, 'application/json');
      final resposta = await pedido.close().timeout(const Duration(seconds: 12));
      final corpo = await resposta.transform(utf8.decoder).join().timeout(const Duration(seconds: 12));
      if (resposta.statusCode == 200) return corpo;
    } catch (_) {
      // tenta de novo
    } finally {
      cliente.close(force: true);
    }
  }
  return null;
}

class RepositorioMapaCampus {
  RepositorioMapaCampus({Future<String?> Function()? buscar}) : _buscar = buscar ?? _buscarLocais;
  static final instancia = RepositorioMapaCampus();

  static const _chave = 'mapa_campus_v1';
  static const validade = Duration(days: 7);

  final Future<String?> Function() _buscar;

  /// Salvo no celular e quando foi lido; null se nunca leu.
  Future<(List<LocalCampus>, DateTime)?> salvos() async {
    final texto = await Banco.ler(_chave);
    if (texto == null) return null;
    try {
      final m = jsonDecode(texto) as Map<String, dynamic>;
      return (
        [for (final l in m['locais'] as List) LocalCampus.deMapa(l as Map<String, dynamic>)],
        DateTime.parse(m['lidoEm'] as String),
      );
    } catch (_) {
      return null;
    }
  }

  /// Os prédios do campus: do celular se ainda valem (ou se a Ufac não responder), senão da Ufac.
  Future<List<LocalCampus>?> locais({bool forcar = false}) async {
    final guardado = await salvos();
    if (!forcar && guardado != null && DateTime.now().difference(guardado.$2) < validade) return guardado.$1;
    final resposta = await _buscar();
    final lidos = resposta == null ? null : lerLocaisCampus(resposta);
    if (lidos == null || lidos.isEmpty) return guardado?.$1;
    await Banco.gravar(
      _chave,
      jsonEncode({
        'lidoEm': DateTime.now().toIso8601String(),
        'locais': [for (final l in lidos) l.paraMapa()],
      }),
    );
    return lidos;
  }
}
