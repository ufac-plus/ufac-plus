import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Escolhas da pessoa. Ficam fora do cache, para "Limpar dados salvos" não apagá-las.
class Preferencias extends ChangeNotifier {
  Preferencias._();
  static final instancia = Preferencias._();

  static const _cofre = FlutterSecureStorage();
  static const _chaveTema = 'pref_tema';
  static const _chaveFeriados = 'pref_avisar_feriados';
  static const _chaveClassroom = 'pref_avisar_classroom';
  static const _chaveSaldoBaixo = 'pref_avisar_saldo_baixo';
  static const _chaveMonitoria = 'pref_avisar_monitoria';

  ThemeMode tema = ThemeMode.system;
  bool avisarFeriados = true;
  bool avisarClassroom = true;

  /// "Saldo baixo" no cartão do RU (issue #14, igual ao iPhone): ligado por padrão.
  bool avisarSaldoBaixo = true;

  /// Aviso de edital novo de monitoria da Prograd: desligado até a pessoa pedir (igual ao iPhone).
  bool avisarMonitoria = false;

  Future<void> carregar() async {
    tema = ThemeMode.values.asNameMap()[await _cofre.read(key: _chaveTema)] ?? ThemeMode.system;
    avisarFeriados = await _cofre.read(key: _chaveFeriados) != 'nao';
    avisarClassroom = await _cofre.read(key: _chaveClassroom) != 'nao';
    avisarSaldoBaixo = await _cofre.read(key: _chaveSaldoBaixo) != 'nao';
    avisarMonitoria = await _cofre.read(key: _chaveMonitoria) == 'sim';
    notifyListeners();
  }

  Future<void> definirTema(ThemeMode novo) async {
    tema = novo;
    notifyListeners();
    await _cofre.write(key: _chaveTema, value: novo.name);
  }

  Future<void> definirAvisarFeriados(bool novo) async {
    avisarFeriados = novo;
    notifyListeners();
    await _cofre.write(key: _chaveFeriados, value: novo ? 'sim' : 'nao');
  }

  Future<void> definirAvisarClassroom(bool novo) async {
    avisarClassroom = novo;
    notifyListeners();
    await _cofre.write(key: _chaveClassroom, value: novo ? 'sim' : 'nao');
  }

  Future<void> definirAvisarSaldoBaixo(bool novo) async {
    avisarSaldoBaixo = novo;
    notifyListeners();
    await _cofre.write(key: _chaveSaldoBaixo, value: novo ? 'sim' : 'nao');
  }

  Future<void> definirAvisarMonitoria(bool novo) async {
    avisarMonitoria = novo;
    notifyListeners();
    await _cofre.write(key: _chaveMonitoria, value: novo ? 'sim' : 'nao');
  }

  void limpar() {
    tema = ThemeMode.system;
    avisarFeriados = true;
    avisarClassroom = true;
    avisarSaldoBaixo = true;
    avisarMonitoria = false;
    notifyListeners();
  }
}
