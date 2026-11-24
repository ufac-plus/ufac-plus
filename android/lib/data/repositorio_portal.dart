import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config.dart';
import '../extractors/portal.dart';
import '../session/regras_sessao.dart';
import '../session/sessao.dart';
import 'academico.dart';
import 'banco.dart';

enum ResultadoPortal { atualizado, sessaoExpirada, falhou }

/// Um semestre das Notas: o atual ou um já encerrado que a pessoa abriu.
class SemestreDeNotas {
  const SemestreDeNotas(this.semestre, this.disciplinas, this.lidasEm, {required this.atual});
  final String semestre;
  final List<NotasDisciplina> disciplinas;
  final DateTime? lidasEm;
  final bool atual;

  Map<String, Object> paraMapa() => {
    'lidasEm': ?lidasEm?.toIso8601String(),
    'disciplinas': [for (final d in disciplinas) d.paraMapa()],
  };

  static SemestreDeNotas deMapa(String semestre, Map<String, dynamic> m) => SemestreDeNotas(
    semestre,
    [for (final d in m['disciplinas'] as List) NotasDisciplina.deMapa(d as Map<String, dynamic>)],
    DateTime.tryParse(m['lidasEm'] as String? ?? ''),
    atual: false,
  );
}

/// Identificação e horários. A sessão do portal é curta, então o app vive do que está salvo
/// e só lê de novo depois de um login ou quando a pessoa puxa para atualizar.
class RepositorioPortal extends ChangeNotifier {
  RepositorioPortal._();
  static final instancia = RepositorioPortal._();

  static const _cofre = FlutterSecureStorage();
  static const _chaveMatricula = 'matricula';
  static const _chaveId = 'identificacao';
  static const _chaveAulas = 'aulas';
  static const _chaveIdInterno = 'id_interno';
  // v2: quadro completo (avaliações, pesos, exame). O formato antigo é ignorado.
  static const _chaveNotas = 'notas_v2';

  String? _idInterno;

  Identificacao? identificacao;
  String? matricula;
  List<Aula>? aulas;
  List<NotasDisciplina>? notas;
  String? semestreDasNotas;
  DateTime? notasLidasEm;
  bool carregando = false;

  // Notas por semestre (issue #23). `notas`, `semestreDasNotas` e `notasLidasEm` continuam sendo o semestre atual,
  // o que as outras telas usam. `_semestres` é a lista da página de Notas (com os endereços de cada disciplina) e
  // `_anteriores` guarda, pelo nome, os semestres encerrados que a pessoa abriu.
  List<ListaDeNotas> _semestres = [];
  Map<String, SemestreDeNotas> _anteriores = {};

  /// Semestres anteriores sendo lidos agora: podem correr junto com a leitura do atual.
  final Set<String> _lendo = {};

  Future<void> carregarSalvos() async {
    matricula = await _cofre.read(key: _chaveMatricula);
    final id = await Banco.ler(_chaveId);
    if (id != null) identificacao = Identificacao.deMapa(jsonDecode(id) as Map<String, dynamic>);
    final salvas = await Banco.ler(_chaveAulas);
    if (salvas != null) {
      aulas = (jsonDecode(salvas) as List).map((a) => Aula.deMapa(a as Map<String, dynamic>)).toList();
    }
    final salvasNotas = await Banco.ler(_chaveNotas);
    if (salvasNotas != null) {
      final m = jsonDecode(salvasNotas) as Map<String, dynamic>;
      semestreDasNotas = m['semestre'] as String;
      notasLidasEm = DateTime.parse(m['lidasEm'] as String);
      notas = (m['disciplinas'] as List).map((n) => NotasDisciplina.deMapa(n as Map<String, dynamic>)).toList();
      // Cache de antes do seletor de semestre não tem estes campos: abre só com o atual.
      _semestres = [
        for (final l in m['semestres'] as List? ?? const []) ListaDeNotas.deMapa(l as Map<String, dynamic>),
      ];
      _anteriores = {
        for (final MapEntry(:key, :value) in (m['anteriores'] as Map<String, dynamic>? ?? const {}).entries)
          key: SemestreDeNotas.deMapa(key, value as Map<String, dynamic>),
      };
    }
    notifyListeners();
  }

  /// Logo depois do primeiro login a sessão está nova: é a hora de ler.
  Future<void> aoAbrirApp() async {
    // Quem pulou o Portal no login não tem o que ler: a Início mostra o botão "Entrar no Portal".
    if (identificacao == null && Sessao.instancia.conectado(Sistema.portal)) await atualizar();
  }

  Future<ResultadoPortal> atualizar() async {
    if (carregando) return ResultadoPortal.falhou;
    carregando = true;
    notifyListeners();
    final resultado = await _ler();
    carregando = false;
    notifyListeners();
    return resultado;
  }

  Future<ResultadoPortal> _ler() async {
    final sessao = Sessao.instancia;
    final inicio = await sessao.lerEMarcar(Sistema.portal);
    if (inicio.resultado == ResultadoVerificacao.expirada) return ResultadoPortal.sessaoExpirada;
    final id = inicio.html == null ? null : lerIdInterno(inicio.html!);
    if (id == null) return ResultadoPortal.falhou;
    await _guardarId(id);

    final relatorios = await sessao.lerEMarcar(Sistema.portal, url: urlRelatorios(id));
    final dados = relatorios.html == null ? null : lerIdentificacao(relatorios.html!);
    if (dados == null) return ResultadoPortal.falhou;
    identificacao = dados.identificacao;
    matricula = dados.matricula;
    await _cofre.write(key: _chaveMatricula, value: dados.matricula);
    await Banco.gravar(_chaveId, jsonEncode(dados.identificacao.paraMapa()));
    notifyListeners();

    final quadro = await sessao.lerEMarcar(Sistema.portal, url: urlHorarios(id));
    final lidas = quadro.html == null ? null : lerHorarios(quadro.html!);
    if (lidas == null) return ResultadoPortal.falhou;
    aulas = lidas;
    await Banco.gravar(_chaveAulas, jsonEncode(lidas.map((a) => a.paraMapa()).toList()));
    notifyListeners();
    return _lerNotas(id);
  }

  Future<ResultadoPortal> _lerNotas(String id) async {
    final pagina = await Sessao.instancia.lerEMarcar(Sistema.portal, url: urlNotas(id));
    if (pagina.resultado == ResultadoVerificacao.expirada) return ResultadoPortal.sessaoExpirada;
    // A lista dos semestres anteriores vem desta mesma página, sem pedido a mais.
    final semestres = pagina.html == null ? null : lerSemestresDeNotas(pagina.html!);
    if (semestres == null) return ResultadoPortal.falhou;
    final lista = semestres.first;
    final (lidas, resultado) = await _lerDisciplinas(lista.disciplinas, notas);
    if (lidas == null) return resultado;
    notas = lidas;
    semestreDasNotas = lista.semestre;
    notasLidasEm = DateTime.now();
    _semestres = semestres;
    // Um semestre que era "anterior" e voltou a ser o atual não fica duplicado.
    _anteriores.remove(lista.semestre);
    await _gravarNotas();
    return ResultadoPortal.atualizado;
  }

  /// Quadro e carga horária de cada disciplina, uma por vez para não sobrecarregar o portal. A carga horária muda
  /// pouco: vem de [salvas] e só é lida da página da turma uma vez (issue #22).
  Future<(List<NotasDisciplina>?, ResultadoPortal)> _lerDisciplinas(
    List<DisciplinaDoSemestre> lista,
    List<NotasDisciplina>? salvas,
  ) async {
    final sessao = Sessao.instancia;
    final lidas = <NotasDisciplina>[];
    for (final d in lista) {
      final url = d.urlNotas;
      final quadro = url == null ? null : await sessao.lerEMarcar(Sistema.portal, url: url);
      if (quadro != null && quadro.resultado != ResultadoVerificacao.ativa) {
        final expirou = quadro.resultado == ResultadoVerificacao.expirada;
        return (null, expirou ? ResultadoPortal.sessaoExpirada : ResultadoPortal.falhou);
      }
      final lida = lerNotasDaDisciplina(quadro?.html ?? '', d);
      var carga = notasDaDisciplina(salvas, d.disciplina)?.cargaHoraria;
      final urlTurma = d.urlTurma;
      if (carga == null && urlTurma != null) {
        final turma = await sessao.lerEMarcar(Sistema.portal, url: urlTurma);
        if (turma.html != null) carga = lerCargaHoraria(turma.html!);
      }
      lidas.add(lida.comCargaHoraria(carga));
    }
    return (lidas, ResultadoPortal.atualizado);
  }

  /// Semestres para o seletor, o mais recente primeiro. Cache antigo (sem a lista) tem só o atual.
  List<({String semestre, bool atual})> get listaDeSemestres {
    final atual = semestreDasNotas;
    if (atual == null) return const [];
    final nomes = _semestres.isEmpty ? [atual] : _semestres.map((s) => s.semestre);
    return [for (final s in nomes) (semestre: s, atual: s == atual)];
  }

  bool _eAtual(String? nome) => nome == null || nome == semestreDasNotas;

  /// O semestre escolhido, do cache (null = o atual). Null se ainda não foi lido.
  SemestreDeNotas? semestreEmCache(String? nome) {
    final atual = semestreDasNotas, lidas = notas;
    if (_eAtual(nome)) {
      return atual == null || lidas == null ? null : SemestreDeNotas(atual, lidas, notasLidasEm, atual: true);
    }
    return _anteriores[nome];
  }

  /// Um semestre encerrado não muda: só é lido se nunca foi. O atual segue a regra de sempre (login e puxar).
  bool precisaLer(String? nome) => semestreEmCache(nome) == null;

  /// Para o esqueleto de cada semestre: o atual e um anterior podem ser lidos ao mesmo tempo.
  bool lendoSemestre(String? nome) => _eAtual(nome) ? carregando : _lendo.contains(nome);

  /// Um semestre já encerrado, só quando a pessoa o escolhe (ou puxa para atualizar nele). Não relê a página de
  /// Notas: os endereços das disciplinas vieram com o semestre atual.
  Future<ResultadoPortal> atualizarSemestre(String nome) async {
    if (_eAtual(nome)) return atualizar();
    final lista = _semestres.where((s) => s.semestre == nome).firstOrNull;
    if (lista == null || _lendo.contains(nome)) return ResultadoPortal.falhou;
    _lendo.add(nome);
    notifyListeners();
    try {
      final (lidas, resultado) = await _lerDisciplinas(lista.disciplinas, _anteriores[nome]?.disciplinas);
      if (lidas == null) return resultado;
      _anteriores[nome] = SemestreDeNotas(nome, lidas, DateTime.now(), atual: false);
      await _gravarNotas();
      return ResultadoPortal.atualizado;
    } finally {
      _lendo.remove(nome);
      notifyListeners();
    }
  }

  // O atual e um anterior podem terminar juntos: cada gravação leva tudo o que está na memória naquele momento e
  // entra numa fila, para a mais antiga nunca sobrescrever a mais nova.
  Future<void> _filaNotas = Future.value();

  Future<void> _gravarNotas() {
    final texto = jsonEncode({
      'semestre': semestreDasNotas,
      'lidasEm': notasLidasEm?.toIso8601String(),
      'disciplinas': [for (final n in notas ?? const <NotasDisciplina>[]) n.paraMapa()],
      'semestres': [for (final s in _semestres) s.paraMapa()],
      'anteriores': {for (final MapEntry(:key, :value) in _anteriores.entries) key: value.paraMapa()},
    });
    final vez = _filaNotas.then((_) => Banco.gravar(_chaveNotas, texto));
    _filaNotas = vez.catchError((Object _) {});
    return vez;
  }

  Future<void> _guardarId(String id) async {
    _idInterno = id;
    await _cofre.write(key: _chaveIdInterno, value: id);
  }

  /// O número interno dos endereços do portal. Null se a sessão caiu e ele ainda não é conhecido.
  Future<String?> garantirIdInterno() async {
    final salvo = _idInterno ?? await _cofre.read(key: _chaveIdInterno);
    if (salvo != null) return _idInterno = salvo;
    final inicio = await Sessao.instancia.lerEMarcar(Sistema.portal);
    final id = inicio.html == null ? null : lerIdInterno(inicio.html!);
    if (id != null) await _guardarId(id);
    return id;
  }

  /// Null se a sessão caiu: a página oficial pede o login por conta própria.
  Future<String?> lerEnderecoComunicacoesDoPortal() async {
    final inicio = await Sessao.instancia.lerEMarcar(Sistema.portal);
    return inicio.html == null ? null : lerEnderecoComunicacoes(inicio.html!);
  }

  /// O endereço de "Mais relatórios" vem da página. Null se a sessão caiu.
  Future<String?> lerEnderecoMaisRelatorios() async {
    final id = await garantirIdInterno();
    if (id == null) return null;
    final pagina = await Sessao.instancia.lerEMarcar(Sistema.portal, url: urlRelatorios(id));
    return pagina.html == null ? null : lerEnderecoMaisRelatoriosDe(pagina.html!);
  }

  /// "Limpar dados salvos": o banco é apagado pelo repositório do RU; aqui só a memória.
  void limparCache() {
    identificacao = null;
    aulas = null;
    notas = null;
    semestreDasNotas = null;
    notasLidasEm = null;
    _semestres = [];
    _anteriores = {};
    notifyListeners();
  }

  void limpar() {
    _idInterno = null;
    identificacao = null;
    matricula = null;
    aulas = null;
    notas = null;
    semestreDasNotas = null;
    notasLidasEm = null;
    _semestres = [];
    _anteriores = {};
    notifyListeners();
  }
}
