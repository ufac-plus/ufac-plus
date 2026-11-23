import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config.dart';
import '../extractors/portal.dart';
import '../session/regras_sessao.dart';
import '../session/sessao.dart';
import 'academico.dart';
import 'banco.dart';
import 'semestres.dart';

enum ResultadoPortal { atualizado, sessaoExpirada, falhou }

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

  /// Todos os semestres da página de Notas, o mais recente primeiro, com os endereços de cada disciplina.
  List<ListaDeNotas> semestresDasNotas = const [];

  /// Semestres encerrados que a pessoa já abriu, pelo nome ("1° Semestre / 2026").
  Map<String, SemestreLido> notasAnteriores = const {};

  /// Semestres anteriores sendo lidos agora (o atual usa [carregando]).
  final Set<String> lendoSemestres = {};

  /// Substituído nos testes, onde não existe SQLite.
  @visibleForTesting
  Future<void> Function(String chave, String valor) gravarNoBanco = Banco.gravar;

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
      // Cache de antes do seletor de semestres não tem estas chaves: abre só com o atual.
      semestresDasNotas = [
        for (final l in (m['semestres'] as List?) ?? const []) ListaDeNotas.deMapa(l as Map<String, dynamic>),
      ];
      notasAnteriores = {
        for (final e in ((m['anteriores'] as Map<String, dynamic>?) ?? const {}).entries)
          e.key: SemestreLido.deMapa(e.value as Map<String, dynamic>),
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
    final sessao = Sessao.instancia;
    final pagina = await sessao.lerEMarcar(Sistema.portal, url: urlNotas(id));
    // A lista dos semestres anteriores vem desta mesma página, sem pedido a mais.
    final semestres = pagina.html == null ? null : lerSemestresDeNotas(pagina.html!);
    if (semestres == null) return ResultadoPortal.falhou;
    final lista = semestres.first;
    final lidas = await _lerDisciplinas(lista.disciplinas, notas ?? const []);
    if (lidas == null) return ResultadoPortal.falhou;
    notas = lidas;
    semestreDasNotas = lista.semestre;
    notasLidasEm = DateTime.now();
    semestresDasNotas = semestres;
    notasAnteriores = anterioresSemOAtual(notasAnteriores, lista.semestre);
    await _gravarNotas();
    return ResultadoPortal.atualizado;
  }

  /// Quadro e carga horária de cada disciplina, uma por vez para não sobrecarregar o portal.
  /// Null se a sessão caiu ou a página não respondeu no meio.
  Future<List<NotasDisciplina>?> _lerDisciplinas(List<DisciplinaDoSemestre> lista, List<NotasDisciplina> antes) async {
    final sessao = Sessao.instancia;
    final lidas = <NotasDisciplina>[];
    for (final d in lista) {
      final url = d.urlNotas;
      final quadro = url == null ? null : await sessao.lerEMarcar(Sistema.portal, url: url);
      if (url != null && quadro?.resultado != ResultadoVerificacao.ativa) return null;
      final lida = lerNotasDaDisciplina(quadro?.html ?? '', d);
      // A carga horária não muda no semestre: só lê a página da turma se ainda não souber (como no iPhone).
      var carga = antes.where((a) => a.disciplina == lida.disciplina).firstOrNull?.cargaHoraria;
      if (carga == null && d.urlTurma != null) {
        final turma = await sessao.lerEMarcar(Sistema.portal, url: d.urlTurma!);
        if (turma.html != null) carga = lerCargaHoraria(turma.html!);
      }
      lidas.add(lida.comCargaHoraria(carga));
    }
    return lidas;
  }

  /// Grava o que está na memória: o atual nos campos de sempre, mais a lista e os anteriores.
  /// Cada gravação leva o estado inteiro, então ler o atual e um anterior juntos não perde nenhum.
  Future<void> _gravarNotas() async {
    final semestre = semestreDasNotas, lidas = notas, lidasEm = notasLidasEm;
    if (semestre == null || lidas == null || lidasEm == null) return;
    await gravarNoBanco(
      _chaveNotas,
      jsonEncode({
        'semestre': semestre,
        'lidasEm': lidasEm.toIso8601String(),
        'disciplinas': lidas.map((n) => n.paraMapa()).toList(),
        'semestres': [for (final l in semestresDasNotas) l.paraMapa()],
        'anteriores': {for (final e in notasAnteriores.entries) e.key: e.value.paraMapa()},
      }),
    );
  }

  /// O semestre atual como [SemestreLido]. Null se as notas ainda não foram lidas.
  SemestreLido? get notasDoAtual {
    final semestre = semestreDasNotas, lidas = notas, lidasEm = notasLidasEm;
    if (semestre == null || lidas == null || lidasEm == null) return null;
    return SemestreLido(semestre: semestre, disciplinas: lidas, lidoEm: lidasEm, atual: true);
  }

  /// Semestres para o seletor da tela Notas, o mais recente primeiro.
  List<OpcaoSemestre> get opcoesDeSemestre =>
      listaDeSemestres(semestreDasNotas, [for (final l in semestresDasNotas) l.semestre]);

  /// As notas de um semestre, do cache (null = o atual). Null se ainda não foram lidas.
  SemestreLido? notasDoSemestre(String? nome) => semestreEmCache(notasDoAtual, notasAnteriores, nome);

  /// Semestre encerrado já lido abre do cache, sem pedir nada à Ufac.
  bool precisaLer(String nome) => precisaLerSemestre(notasDoAtual, notasAnteriores, nome);

  /// Lê um semestre já encerrado, só quando a pessoa o escolhe (ou puxa para atualizar nele),
  /// com a sessão que já existe. Não relê a página de Notas: os endereços vieram com o atual.
  Future<ResultadoPortal> atualizarSemestre(String nome) async {
    if (nome == semestreDasNotas) return atualizar();
    final lista = semestresDasNotas.where((s) => s.semestre == nome).firstOrNull;
    if (lista == null || lendoSemestres.contains(nome)) return ResultadoPortal.falhou;
    lendoSemestres.add(nome);
    notifyListeners();
    try {
      final lidas = await _lerDisciplinas(lista.disciplinas, notasAnteriores[nome]?.disciplinas ?? const []);
      if (lidas == null) {
        return Sessao.instancia.expirados.contains(Sistema.portal)
            ? ResultadoPortal.sessaoExpirada
            : ResultadoPortal.falhou;
      }
      // "Limpar dados" ou "Sair" no meio da leitura: não traz de volta o que foi apagado.
      if (!semestresDasNotas.any((s) => s.semestre == nome)) return ResultadoPortal.falhou;
      notasAnteriores = {
        ...notasAnteriores,
        nome: SemestreLido(semestre: nome, disciplinas: lidas, lidoEm: DateTime.now()),
      };
      await _gravarNotas();
      return ResultadoPortal.atualizado;
    } finally {
      lendoSemestres.remove(nome);
      notifyListeners();
    }
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
    semestresDasNotas = const [];
    notasAnteriores = const {};
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
    semestresDasNotas = const [];
    notasAnteriores = const {};
    notifyListeners();
  }
}
