import '../config.dart';

/// A refeição em andamento ou a próxima. Depois do jantar, volta para o café.
Refeicao proximaRefeicao(DateTime agora) {
  final minutos = agora.hour * 60 + agora.minute;
  for (final r in Refeicao.values) {
    if (minutos < r.horario.fimMin) return r;
  }
  return Refeicao.cafe;
}

/// Depois do jantar, a próxima refeição é o café de amanhã. A página do eTICKET não tem data, então quem mostra o
/// cardápio precisa saber disso para nunca exibir o café de hoje, que já passou, como se fosse o próximo (issue #21).
bool refeicaoDeAmanha(DateTime agora) => agora.hour * 60 + agora.minute >= Refeicao.jantar.horario.fimMin;

final _saudacao = RegExp(
  r'^(bo[am]\s+(café|cafe|almoço|almoco|jantar|janta|apetite|refeição|refeicao)|tenham?\s+um)',
  caseSensitive: false,
);
final _rotulo = RegExp(r'^([A-ZÀ-Ý ]{3,}):\s*(.*)$');

/// "SALADA: Alface" vira "Salada: Alface". O rótulo é do próprio eTICKET, não inventado.
String _rotuloLegivel(String linha) {
  final m = _rotulo.firstMatch(linha);
  if (m == null) return linha;
  final r = m[1]!.trim().toLowerCase();
  return '${r[0].toUpperCase()}${r.substring(1)}: ${m[2]}';
}

/// Separa o texto do eTICKET em itens. Aceita os dois formatos já vistos (igual ao app do iPhone):
/// uma frase com vírgulas ("Café preto, Leite, Pão.") e uma linha por item ("-Arroz\nSALADA: Alface\nBom almoço <3").
/// Saudações e enfeites saem. "Não informado" vira lista vazia.
List<String> itensDoCardapio(String texto) {
  final limpo = texto.trim();
  final baixo = limpo.toLowerCase().replaceAll(RegExp(r'[.!\s]+$'), '');
  if (limpo.isEmpty || baixo == 'não informado' || baixo == 'nao informado' || baixo == 'indisponível') {
    return const [];
  }
  final linhas = limpo
      .split(RegExp(r'\r?\n'))
      .map((l) => l.replaceFirst(RegExp(r'^[\s\-–—•*·]+'), '').replaceFirst(RegExp(r'\s*(<3|❤️?|♥)+\s*$'), '').trim())
      .where((l) => l.isNotEmpty && !_saudacao.hasMatch(l));
  return [
    for (final l in linhas)
      if (_rotulo.hasMatch(l.replaceFirst(RegExp(r'[.;]$'), '')))
        _rotuloLegivel(l.replaceFirst(RegExp(r'[.;]$'), ''))
      else
        for (final i in l.replaceFirst(RegExp(r'[.;]$'), '').split(',')) if (i.trim().isNotEmpty) i.trim(),
  ];
}
