// Horas complementares e editais de monitoria: a mesma regra do iPhone 1.8 (iphone/web/src/lib/editais.js).
// A Ufac não escreve as horas no título: sem horas escritas no edital, o app mostra só a faixa típica da
// categoria, sempre como estimativa. O aproveitamento real é o do PPC de cada curso.
import '../extractors/editais.dart';

String _semAcento(String s) {
  const de = 'áàâãäéèêëíìîïóòôõöúùûüç';
  const para = 'aaaaaeeeeiiiiooooouuuuc';
  final b = StringBuffer();
  for (final ch in s.toLowerCase().split('')) {
    final i = de.indexOf(ch);
    b.write(i < 0 ? ch : para[i]);
  }
  return b.toString();
}

final _monitoria = RegExp(r'\b(monitoria|monitores?|promaed)\b');

/// Edital de monitoria (a Prograd chama de monitoria, monitores ou Promaed).
bool ehEditalMonitoria(Edital e) => _monitoria.hasMatch(_semAcento('${e.titulo} ${e.descricao} ${e.url}'));

// Editais que só pagam ou ajudam a pagar algo: não geram certificado de atividade complementar.
final _soAuxilio = RegExp(
  r'\b(auxilio|passe|transporte|moradia|primeira infancia|vagas? residuais?|sisu|transferencia|heteroidentificacao|'
  r'parceiros? em saude|apoio para apresentacao|bolsista administrativo|pro-?pcd|acolhe)\b',
);

class _Categoria {
  const _Categoria(this.nome, this.teste, this.faixa, this.quando);
  final String nome, faixa, quando;
  final RegExp teste;
}

// Da mais específica para a mais geral.
final _categorias = [
  _Categoria('Monitoria', RegExp(r'\b(monitoria|monitores?|promaed)\b'), '~30 a 60 h', ' por semestre'),
  _Categoria('Ensino · PET', RegExp(r'\b(pet|pibid|residencia pedagogica)\b'), '~30 a 60 h', ' por semestre'),
  _Categoria('Pesquisa', RegExp(r'\b(pibic|pibiti|iniciacao cientifica|pesquisa)\b'), '~30 a 60 h', ' por semestre'),
  _Categoria('Bolsa acadêmica', RegExp(r'\b(brinquedotecas?|bolsistas?|apoio pedagogico)\b'), '~30 a 60 h', ''),
  _Categoria(
    'Extensão',
    RegExp(r'\b(programas? de extensao|acoes (regionais )?de extensao|extensao universitaria|projetos? de extensao|cursinho)\b'),
    '~30 a 60 h',
    '',
  ),
  _Categoria(
    'Evento',
    RegExp(
      r'\b(semanas? academicas?|cursos? de (extensao|formacao|capacitacao|linguas|idiomas)|congressos?|simposios?|'
      r'seminarios?|oficinas?|minicursos?|hackathon|mostra|eventos?)\b',
    ),
    '~10 a 40 h',
    ' (pelo certificado)',
  ),
  _Categoria('Cultura / Esporte', RegExp(r'\b(musica|coral|teatro|cultura|pro-?esporte|jubs)\b'), '~15 a 30 h', ''),
];

/// Horas escritas no próprio edital (só com contexto de certificado ou carga; "20 horas semanais" não conta).
int? _horasEscritas(String texto) {
  final m = RegExp(r'(?:carga horaria(?: total)?(?: de)?|certificado de|equivalente a)\s*(\d{1,3})\s*h').firstMatch(texto) ??
      RegExp(r'\b(\d{2,3})\s*horas?\s*(?:de atividades? complementares|complementares)').firstMatch(texto);
  if (m == null) return null;
  final n = int.parse(m[1]!);
  // "carga horária de 12 h semanais" é a dedicação por semana, não o total do certificado.
  final depois = texto.substring(m.end);
  if (n <= 0 || RegExp(r'^(?:oras?)?\s*(?:semanais|por semana|/\s*semana)').hasMatch(depois)) return null;
  return n;
}

class HorasComplementares {
  const HorasComplementares({required this.categoria, required this.rotulo, required this.estimado, this.horas});
  final String categoria, rotulo;
  final int? horas;
  final bool estimado;
}

/// Quantas horas complementares um edital costuma render, ou null quando não gera atividade complementar
/// (auxílios, vagas, cadastros).
HorasComplementares? horasComplementares(Edital e) {
  final texto = _semAcento('${e.titulo} ${e.descricao}');
  if (_soAuxilio.hasMatch(texto) && !RegExp(r'\b(monitoria|monitores?|promaed|pet)\b').hasMatch(texto)) return null;
  final achada = _categorias.where((c) => c.teste.hasMatch(texto)).firstOrNull;
  final horas = _horasEscritas(texto);
  if (horas != null) {
    return HorasComplementares(
      categoria: achada?.nome ?? 'Atividade complementar',
      horas: horas,
      rotulo: '$horas h complementares',
      estimado: false,
    );
  }
  if (achada == null) return null;
  return HorasComplementares(
    categoria: achada.nome,
    rotulo: '${achada.faixa} complementares${achada.quando}',
    estimado: true,
  );
}

const notaHorasComplementares =
    'Estimativa pela categoria do edital. Confira a carga no PDF e quanto o seu curso aproveita, no PPC.';
