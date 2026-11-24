// Editais da Proaes, da Prograd e da Proex: resposta JSON da busca do Plone (www3.ufac.br/<setor>/@search).
// Público, sem login. Null quando a resposta não é a listagem (nunca mostrar dado errado).

const _host = 'https://www3.ufac.br/';

// Só o que é página de edital: pastas (edital + anexos + resultados), arquivos soltos, páginas e links.
const _tipos = {'Folder', 'File', 'Document', 'Link'};

class Edital {
  const Edital({required this.titulo, required this.url, this.publicadoEm, this.atualizadoEm});

  final String titulo, url;
  final DateTime? publicadoEm, atualizadoEm;

  Map<String, dynamic> paraMapa() => {
    'titulo': titulo,
    'url': url,
    'publicadoEm': publicadoEm?.toIso8601String(),
    'atualizadoEm': atualizadoEm?.toIso8601String(),
  };

  factory Edital.deMapa(Map<String, dynamic> m) => Edital(
    titulo: m['titulo'] as String,
    url: m['url'] as String,
    publicadoEm: _data(m['publicadoEm']),
    atualizadoEm: _data(m['atualizadoEm']),
  );
}

/// Só links https do site da Ufac (www3.ufac.br).
bool linkDaUfac(String url) => url.startsWith(_host);

String _limpar(Object? s) => (s is String ? s : '').replaceAll(RegExp(r'\s+'), ' ').trim();

/// Data ISO válida, ou null (o Plone manda "None" ou nada quando a data não foi definida).
DateTime? _data(Object? s) {
  if (s is! String || !RegExp(r'^\d{4}-\d{2}-\d{2}T').hasMatch(s)) return null;
  return DateTime.tryParse(s);
}

/// Lista na ordem da Ufac (mais novo primeiro).
List<Edital>? lerEditais(Object? json) {
  if (json is! Map || json['items'] is! List) return null;
  return [
    for (final i in json['items'] as List)
      if (i is Map &&
          _tipos.contains(i['@type']) &&
          i['@id'] is String &&
          linkDaUfac(i['@id'] as String) &&
          _limpar(i['title']).isNotEmpty)
        Edital(
          titulo: _limpar(i['title']),
          url: i['@id'] as String,
          publicadoEm: _data(i['effective']),
          atualizadoEm: _data(i['modified']),
        ),
  ];
}
