import 'academico.dart';

// Notas por semestre (igual ao iPhone, iphone/web/src/lib/dados.js). O semestre atual continua nos
// campos de sempre do RepositorioPortal (é o que a Início lê); a lista de semestres sai da mesma página
// de Notas, sem pedido a mais; e cada semestre encerrado que a pessoa abre fica guardado em `anteriores`.

/// Um item do seletor de semestre.
class OpcaoSemestre {
  const OpcaoSemestre(this.semestre, {required this.atual});
  final String semestre;
  final bool atual;

  @override
  bool operator ==(Object other) => other is OpcaoSemestre && other.semestre == semestre && other.atual == atual;

  @override
  int get hashCode => Object.hash(semestre, atual);

  @override
  String toString() => 'OpcaoSemestre($semestre, atual: $atual)';
}

/// As notas de um semestre já lido, com a hora da leitura.
class SemestreLido {
  const SemestreLido({required this.semestre, required this.disciplinas, required this.lidoEm, this.atual = false});

  final String semestre;
  final List<NotasDisciplina> disciplinas;
  final DateTime lidoEm;
  final bool atual;

  Map<String, Object> paraMapa() => {
        'semestre': semestre,
        'lidoEm': lidoEm.toIso8601String(),
        'disciplinas': [for (final d in disciplinas) d.paraMapa()],
      };

  static SemestreLido deMapa(Map<String, dynamic> m) => SemestreLido(
        semestre: m['semestre'] as String,
        lidoEm: DateTime.parse(m['lidoEm'] as String),
        disciplinas: [for (final d in m['disciplinas'] as List) NotasDisciplina.deMapa(d as Map<String, dynamic>)],
      );
}

/// Semestres para o seletor, o mais recente primeiro. Cache antigo (sem a lista) tem só o atual.
List<OpcaoSemestre> listaDeSemestres(String? atual, List<String> daPagina) {
  if (atual == null) return const [];
  final nomes = daPagina.isEmpty ? [atual] : daPagina;
  return [for (final s in nomes) OpcaoSemestre(s, atual: s == atual)];
}

/// O semestre escolhido, do cache (null = o atual). Null se ainda não foi lido.
SemestreLido? semestreEmCache(SemestreLido? atual, Map<String, SemestreLido> anteriores, String? nome) {
  if (atual == null) return null;
  if (nome == null || nome == atual.semestre) return atual;
  final s = anteriores[nome];
  return s == null ? null : SemestreLido(semestre: s.semestre, disciplinas: s.disciplinas, lidoEm: s.lidoEm);
}

/// Um semestre encerrado não muda: só é lido se nunca foi (depois, só ao puxar para atualizar nele).
/// O atual segue a regra de sempre do Android: lido no login e ao puxar para atualizar.
bool precisaLerSemestre(SemestreLido? atual, Map<String, SemestreLido> anteriores, String nome) =>
    semestreEmCache(atual, anteriores, nome) == null;

/// Depois de reler o atual: se a página avançou de semestre, ele deixa de ser "anterior".
Map<String, SemestreLido> anterioresSemOAtual(Map<String, SemestreLido> anteriores, String atual) =>
    {for (final e in anteriores.entries) if (e.key != atual) e.key: e.value};
