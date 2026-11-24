import '../config.dart';
import 'refeicoes.dart';

/// Cardápio lido num dia. A página do eTICKET não tem data, então guardamos a da leitura.
class CardapioDoDia {
  const CardapioDoDia(this.lidoEm, this.textos, {this.anterior});

  final DateTime lidoEm;
  final Map<Refeicao, String> textos;

  /// O último cardápio lido num dia anterior. Serve para notar quando o eTICKET ainda mostra o texto de ontem.
  final CardapioDoDia? anterior;

  bool valeEm(DateTime agora) => _mesmoDia(lidoEm, agora);

  List<String> itens(Refeicao r) => itensDoCardapio(textos[r] ?? '');

  /// De manhã cedo o eTICKET pode ainda mostrar o texto de ontem. A refeição fica em dúvida quando o texto é igual
  /// ao do último dia lido e foi lido antes de ela começar. Lido depois do início, vale (o RU repete pratos).
  bool repetida(Refeicao r) {
    final a = anterior;
    if (a == null || _mesmoDia(a.lidoEm, lidoEm)) return false;
    final atual = _assinatura(itens(r));
    if (atual.isEmpty || atual != _assinatura(a.itens(r))) return false;
    return lidoEm.hour * 60 + lidoEm.minute < r.horario.inicioMin;
  }

  /// Cardápio novo lido agora, guardando o de um dia anterior (só um nível, para não crescer).
  CardapioDoDia seguinte(DateTime agora, Map<Refeicao, String> novos) =>
      CardapioDoDia(agora, novos, anterior: valeEm(agora) ? anterior : _semAnterior());

  CardapioDoDia _semAnterior() => CardapioDoDia(lidoEm, textos);

  Map<String, Object> paraMapa() => {
    'lidoEm': lidoEm.toIso8601String(),
    for (final e in textos.entries) e.key.name: e.value,
    if (anterior != null) 'anterior': anterior!._semAnterior().paraMapa(),
  };

  static CardapioDoDia? deMapa(Map<String, dynamic> m) {
    final data = DateTime.tryParse(m['lidoEm'] as String? ?? '');
    if (data == null) return null;
    final a = m['anterior'];
    return CardapioDoDia(data, {
      for (final r in Refeicao.values)
        if (m[r.name] is String) r: m[r.name] as String,
    }, anterior: a is Map<String, dynamic> ? deMapa(a) : null);
  }
}

const avisoCardapioRepetido = 'Igual ao de ontem; o eTICKET pode ainda não ter atualizado.';

bool _mesmoDia(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

String _assinatura(List<String> itens) => itens.join('|').toLowerCase();

/// Vale ler de novo se não há cardápio de hoje, se falta alguma refeição (o eTICKET costuma publicar pouco antes do
/// horário) ou se alguma ainda pode ser a de ontem.
bool cardapioPendente(CardapioDoDia? c, DateTime agora) =>
    c == null || !c.valeEm(agora) || Refeicao.values.any((r) => c.itens(r).isEmpty || c.repetida(r));
