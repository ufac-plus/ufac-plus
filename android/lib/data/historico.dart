class RegistroRefeicao {
  const RegistroRefeicao({
    required this.data,
    required this.hora,
    required this.refeicao,
    required this.prato,
    required this.valor,
    required this.status,
  });

  final String data, hora, refeicao, prato, status;
  final double? valor;

  Map<String, Object?> paraMapa() =>
      {'data': data, 'hora': hora, 'refeicao': refeicao, 'prato': prato, 'valor': valor, 'status': status};

  static RegistroRefeicao deMapa(Map<String, dynamic> m) => RegistroRefeicao(
        data: m['data'] as String,
        hora: m['hora'] as String,
        refeicao: m['refeicao'] as String,
        prato: m['prato'] as String,
        valor: (m['valor'] as num?)?.toDouble(),
        status: m['status'] as String,
      );
}

class RegistroRecarga {
  const RegistroRecarga({
    required this.valor,
    required this.forma,
    required this.data,
    required this.hora,
    required this.situacao,
  });

  final double? valor;
  final String forma, data, hora, situacao;

  Map<String, Object?> paraMapa() =>
      {'valor': valor, 'forma': forma, 'data': data, 'hora': hora, 'situacao': situacao};

  static RegistroRecarga deMapa(Map<String, dynamic> m) => RegistroRecarga(
        valor: (m['valor'] as num?)?.toDouble(),
        forma: m['forma'] as String,
        data: m['data'] as String,
        hora: m['hora'] as String,
        situacao: m['situacao'] as String,
      );
}

class HistoricoRu {
  const HistoricoRu({required this.lidoEm, required this.refeicoes, required this.recargas});

  final DateTime lidoEm;
  final List<RegistroRefeicao> refeicoes;
  final List<RegistroRecarga> recargas;

  Map<String, Object> paraMapa() => {
        'lidoEm': lidoEm.toIso8601String(),
        'refeicoes': refeicoes.map((r) => r.paraMapa()).toList(),
        'recargas': recargas.map((r) => r.paraMapa()).toList(),
      };

  static HistoricoRu deMapa(Map<String, dynamic> m) => HistoricoRu(
        lidoEm: DateTime.parse(m['lidoEm'] as String),
        refeicoes: [for (final r in m['refeicoes'] as List) RegistroRefeicao.deMapa(r as Map<String, dynamic>)],
        recargas: [for (final r in m['recargas'] as List) RegistroRecarga.deMapa(r as Map<String, dynamic>)],
      );
}

/// "01/10/2026" (como o eTICKET escreve) vira data; o que não for data vira null.
DateTime? lerDataEticket(String texto) {
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(texto.trim());
  if (m == null) return null;
  final dia = int.parse(m[1]!), mes = int.parse(m[2]!), ano = int.parse(m[3]!);
  final data = DateTime(ano, mes, dia);
  return data.day == dia && data.month == mes ? data : null;
}

/// Quanto saiu e quanto entrou no RU num mês, só pelo que o histórico do eTICKET mostra.
class GastoMes {
  GastoMes(this.inicio);

  /// Primeiro dia do mês.
  final DateTime inicio;
  int refeicoes = 0, recargas = 0;
  double gastoRefeicoes = 0, recarregado = 0;

  int get mes => inicio.month;
  int get ano => inicio.year;
}

/// Um item por mês com refeição ou recarga, do mais recente ao mais antigo.
/// Linha sem data legível fica de fora; sem valor, conta na quantidade mas não soma.
List<GastoMes> gastosPorMes(HistoricoRu historico) {
  final meses = <DateTime, GastoMes>{};
  GastoMes? doMes(String data) {
    final d = lerDataEticket(data);
    if (d == null) return null;
    final chave = DateTime(d.year, d.month);
    return meses.putIfAbsent(chave, () => GastoMes(chave));
  }

  for (final r in historico.refeicoes) {
    final m = doMes(r.data);
    if (m == null) continue;
    m.refeicoes++;
    m.gastoRefeicoes += r.valor ?? 0;
  }
  for (final r in historico.recargas) {
    final m = doMes(r.data);
    if (m == null) continue;
    m.recargas++;
    m.recarregado += r.valor ?? 0;
  }
  return meses.values.toList()..sort((a, b) => b.inicio.compareTo(a.inicio));
}
