// Aviso de bolsa de monitoria (iPhone 1.8). O iPhone usa o servidor do Matheus para mandar push; o Android
// não tem servidor (regra 3) e não roda nada em segundo plano nos sites da Ufac (seção 12.8), então confere
// a lista pública da Prograd ao abrir o app, no máximo a cada 6 h, só com o aviso ligado. A 1ª leitura só
// marca o que já existe. Edital novo de monitoria vira uma faixa na Início.
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'banco.dart';
import 'editais.dart';
import 'editais_horas.dart';
import 'preferencias.dart';

class AvisoMonitoria extends ChangeNotifier {
  AvisoMonitoria({RepositorioEditais? editais}) : _editais = editais ?? RepositorioEditais.instancia;
  static final instancia = AvisoMonitoria();

  static const _chaveVistos = 'monitoria_vistos_v1';
  static const _chaveUltima = 'monitoria_ultima_v1';
  static const intervalo = Duration(hours: 6);

  final RepositorioEditais _editais;

  /// Edital novo de monitoria ainda não aberto pela pessoa (a faixa da Início).
  Edital? novo;

  Future<Set<String>?> _vistos() async {
    final t = await Banco.ler(_chaveVistos);
    if (t == null) return null;
    try {
      return {for (final u in jsonDecode(t) as List) '$u'};
    } catch (_) {
      return null;
    }
  }

  Future<void> _gravarVistos(Set<String> vistos) => Banco.gravar(_chaveVistos, jsonEncode(vistos.toList()));

  /// Liga ou desliga. Ao ligar, a primeira leitura só marca o que já existe (nada de aviso do que é antigo).
  Future<void> ligar(bool ligado) async {
    await Preferencias.instancia.definirAvisarMonitoria(ligado);
    if (!ligado) {
      novo = null;
      notifyListeners();
      return;
    }
    await conferir(forcar: true);
  }

  /// Ao abrir o app. Não faz nada com o aviso desligado nem antes de 6 h da última conferência.
  Future<void> conferir({bool forcar = false, DateTime? agora}) async {
    if (!Preferencias.instancia.avisarMonitoria) return;
    final momento = agora ?? DateTime.now();
    final ultima = DateTime.tryParse(await Banco.ler(_chaveUltima) ?? '');
    if (!forcar && ultima != null && momento.difference(ultima) < intervalo) return;
    final EditaisLidos lidos;
    try {
      lidos = await _editais.ler(FonteEditais.prograd, agora: momento);
    } catch (_) {
      return; // sem internet: tenta na próxima abertura
    }
    await Banco.gravar(_chaveUltima, momento.toIso8601String());
    final monitoria = lidos.lista.where(ehEditalMonitoria).toList();
    final vistos = await _vistos();
    if (vistos == null) {
      await _gravarVistos({for (final e in monitoria) e.url});
      return;
    }
    final novos = monitoria.where((e) => !vistos.contains(e.url)).toList();
    if (novos.isEmpty) return;
    novo = novos.first;
    await _gravarVistos({...vistos, for (final e in novos) e.url});
    notifyListeners();
  }

  /// A pessoa abriu ou fechou a faixa.
  void dispensar() {
    novo = null;
    notifyListeners();
  }
}
