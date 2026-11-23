import 'package:flutter/material.dart';

import '../data/academico.dart';
import '../theme/app_cores.dart';
import '../theme/app_texto.dart';

/// "6 de 16 faltas permitidas", em âmbar perto do limite e em vermelho ao passar dele.
/// O limite vem da carga horária da disciplina (16 numa de 60 h, 8 numa de 30 h); sem a carga, 16
/// como estimativa. Com [mostrarDetalhe], embaixo vem "Frequência X% · carga de Y h" (tela Notas).
class AvisoFaltas extends StatelessWidget {
  const AvisoFaltas({super.key, required this.nota, this.mostrarDetalhe = false});

  final NotasDisciplina nota;
  final bool mostrarDetalhe;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final s = situacaoFaltas(nota.faltas, cargaHoraria: nota.cargaHoraria);
    if (s == null) return const SizedBox.shrink();
    final restam = s.permitidas - s.faltas;
    final (cor, fundo, icone, texto) = switch (s.nivel) {
      NivelFaltas.limite => (
          c.perigo,
          c.perigoFundo,
          Icons.error_rounded,
          '${s.faltas} faltas · passou do limite de ${s.permitidas}',
        ),
      NivelFaltas.atencao => (
          c.chipTexto,
          c.chipFundo,
          Icons.warning_rounded,
          restam == 0
              ? '${s.faltas} de ${s.permitidas} faltas · no limite'
              : '${s.faltas} de ${s.permitidas} faltas · ${restam == 1 ? 'resta 1' : 'restam $restam'}',
        ),
      NivelFaltas.tranquilo => (
          c.secundario,
          c.chrome,
          Icons.event_busy_rounded,
          '${s.faltas} de ${s.permitidas} faltas permitidas',
        ),
    };
    final selo = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: fundo, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icone, size: 16, color: cor),
          const SizedBox(width: 6),
          Flexible(
            child: Text(texto, style: AppTexto.rotulo.copyWith(color: cor)),
          ),
        ],
      ),
    );
    if (!mostrarDetalhe) return selo;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        selo,
        const SizedBox(height: 6),
        Text(detalheFrequencia(s), style: AppTexto.rotulo.copyWith(color: c.secundario)),
      ],
    );
  }
}
