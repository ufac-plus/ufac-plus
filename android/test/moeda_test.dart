import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/theme/app_texto.dart';
import 'package:ufac_no_bolso/ui/componentes.dart';

// Issue #5: no saldo, a vírgula parecia afastada ("12 ,50"). O texto é "R$ 12,50", sem espaço: a causa é a
// Plus Jakarta Sans, cuja vírgula tem margens laterais largas (maiores à esquerda). Este teste desenha o texto
// com a fonte de verdade e mede, em pixels, o espaço em branco entre as manchas de tinta de cada caractere.

/// Espaços em branco entre manchas de tinta, da esquerda para a direita, só na faixa logo acima da linha de base
/// (um quarto da altura da fonte), onde fica a cabeça da vírgula, a parte que o olho vê. A cauda desce para a
/// esquerda, e o alto de dígitos como o 7 avança sobre a vírgula sem que o olho junte os dois.
Future<List<int>> vaos(InlineSpan span, double tamanho) async {
  final p = TextPainter(
    text: TextSpan(
      style: const TextStyle(color: Color(0xFF000000)),
      children: [span],
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  final gravador = ui.PictureRecorder();
  final tela = Canvas(gravador)..drawColor(const Color(0xFFFFFFFF), BlendMode.src);
  p.paint(tela, Offset.zero);
  final largura = p.width.ceil() + 2, altura = p.height.ceil() + 2;
  final imagem = await gravador.endRecording().toImage(largura, altura);
  final px = (await imagem.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  final base = p.computeDistanceToActualBaseline(TextBaseline.alphabetic).round();
  final topo = base - tamanho ~/ 4;
  bool tinta(int x) {
    for (var y = topo; y < base; y++) {
      if (px.getUint8((y * largura + x) * 4) < 128) return true;
    }
    return false;
  }

  final resultado = <int>[];
  var x = 0;
  while (x < largura && !tinta(x)) {
    x++;
  }
  while (x < largura) {
    while (x < largura && tinta(x)) {
      x++;
    }
    final inicio = x;
    while (x < largura && !tinta(x)) {
      x++;
    }
    if (x < largura) resultado.add(x - inicio);
  }
  return resultado;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    final fonte = FontLoader(AppTexto.familia)..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await fonte.load();
  });

  // Tamanho grande para medir com folga; o ajuste é proporcional à fonte, então vale para os 38 px do saldo.
  final estilo = AppTexto.saldo.copyWith(fontSize: 200);

  // Referência: o mesmo dígito vizinho de um "0" em vez da vírgula. Cada dígito tem o seu desenho (o 7 e o 9
  // deixam o pé aberto), então a comparação é dígito a dígito. Antes da correção, a vírgula somava de 10 a 16 px
  // (de 0,05 a 0,08 da fonte) a mais que um dígito dos dois lados, mais à esquerda.
  test('saldo: a vírgula fica tão perto de cada dígito quanto outro dígito ficaria (issue #5)', () async {
    final tam = estilo.fontSize!;
    final folga = 0.02 * tam;
    for (var d = 0; d < 10; d++) {
      final comVirgula = await vaos(spanMoeda('$d,5', estilo), tam);
      final comDigito = await vaos(TextSpan(text: '${d}05', style: estilo), tam);
      final antes = comVirgula[0], referencia = comDigito[0];
      expect(
        antes,
        inInclusiveRange(referencia * 0.6, referencia + folga),
        reason: '"$d,": $antes px; "${d}0": $referencia px',
      );

      final depoisVirgula = await vaos(spanMoeda('5,$d', estilo), tam);
      final depoisDigito = await vaos(TextSpan(text: '50$d', style: estilo), tam);
      final depois = depoisVirgula[1], ref = depoisDigito[1];
      expect(depois, inInclusiveRange(ref * 0.6, ref + folga), reason: '",$d": $depois px; "0$d": $ref px');
    }
  });

  test('o texto continua o mesmo para leitores de tela e para copiar', () {
    expect(spanMoeda('R\$ 1.234,50', AppTexto.saldo).toPlainText(), 'R\$ 1.234,50');
  });
}
