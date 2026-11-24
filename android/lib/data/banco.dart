import 'package:flutter/foundation.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

/// Cache local em SQLite. Nunca guardar aqui a matrícula nem o número do QR (regra 6).
class Banco {
  static Database? _db;

  /// Nos testes, troca o SQLite por um mapa (o SQLite não roda no `flutter test`).
  @visibleForTesting
  static Map<String, String>? memoria;

  static Future<Database> _abrir() async => _db ??= await openDatabase(
    join(await getDatabasesPath(), 'ufac_no_bolso.db'),
    version: 1,
    onCreate: (db, _) => db.execute('CREATE TABLE cache (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)'),
  );

  static Future<String?> ler(String chave) async {
    if (memoria case final m?) return m[chave];
    final linhas = await (await _abrir()).query('cache', where: 'chave = ?', whereArgs: [chave]);
    return linhas.isEmpty ? null : linhas.first['valor'] as String;
  }

  static Future<void> gravar(String chave, String valor) async {
    if (memoria case final m?) {
      m[chave] = valor;
      return;
    }
    await (await _abrir()).insert('cache', {
      'chave': chave,
      'valor': valor,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<void> apagar(String chave) async {
    if (memoria case final m?) {
      m.remove(chave);
      return;
    }
    await (await _abrir()).delete('cache', where: 'chave = ?', whereArgs: [chave]);
  }

  static Future<void> apagarTudo() async {
    if (memoria case final m?) return m.clear();
    await (await _abrir()).delete('cache');
  }
}
