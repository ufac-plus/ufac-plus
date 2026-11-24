import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as caminho;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../data/academico.dart';
import '../data/agenda.dart';
import '../data/repositorio_portal.dart';
import '../data/repositorio_professor.dart';
import '../theme/app_cores.dart';
import '../theme/app_medidas.dart';
import '../theme/app_texto.dart';
import '../ui/componentes.dart';
import '../ui/formatos.dart';
import 'acoes_portal.dart';
import 'acoes_professor.dart';
import 'menu.dart';

class TelaHorarios extends StatefulWidget {
  const TelaHorarios({super.key, this.professor = false});

  /// Professor: horários de todas as turmas, do Portal do Professor.
  final bool professor;

  @override
  State<TelaHorarios> createState() => _TelaHorariosState();
}

class _TelaHorariosState extends State<TelaHorarios> {
  static const _dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  final _hoje = DateTime.now().weekday;
  late int _dia = _hoje;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.professor ? RepositorioProfessor.instancia : RepositorioPortal.instancia,
      builder: (context, _) => _construir(context),
    );
  }

  Widget _construir(BuildContext context) {
    final portal = RepositorioPortal.instancia, prof = RepositorioProfessor.instancia;
    final professor = widget.professor;
    final todas = professor ? prof.aulas : portal.aulas;
    final carregando = professor ? prof.carregando : portal.carregando;
    final c = context.cores;
    final hoje = DateTime.now();
    final aulas = (todas ?? const <Aula>[]).where((a) => a.diaSemana == _dia && a.valeNoDia(hoje)).toList()
      ..sort((a, b) => a.inicioMin.compareTo(b.inicioMin));
    final semestre = professor ? prof.semestre : portal.identificacao?.semestre;
    return ListaDaTela(
      aoAtualizar: () => professor ? atualizarProfessor(context) : atualizarPortal(context),
      children: [
        CabecalhoTela(
          titulo: 'Horários',
          subtitulo: semestre,
          acoes: [BotaoRedondo(icone: Icons.menu_rounded, descricao: 'Menu', aoTocar: () => abrirMenu(context))],
        ),
        Row(
          children: [
            for (var i = 0; i < 7; i++)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: _ChipDia(
                    nome: _dias[i],
                    ativo: _dia == i + 1,
                    hoje: _hoje == i + 1,
                    aoTocar: () => setState(() => _dia = i + 1),
                  ),
                ),
              ),
          ],
        ),
        if (todas == null)
          carregando
              ? const Skeleton(altura: 76, raio: AppMedidas.raioCartao)
              : Cartao(
                  child: EstadoVazio(
                    icone: Icons.calendar_month_rounded,
                    titulo: 'Ainda não li seus horários',
                    acao: BotaoContorno(
                      texto: 'Entrar no Portal',
                      cor: c.navAtivo,
                      aoTocar: () => professor ? entrarNoPortalProfessor(context) : entrarNoPortal(context),
                    ),
                  ),
                )
        else if (aulas.isEmpty)
          const Cartao(
            child: EstadoVazio(icone: Icons.event_available_rounded, titulo: 'Sem aula neste dia'),
          )
        else
          for (final a in aulas)
            Cartao(
              child: Row(
                children: [
                  IconeQuadrado(icone: Icons.schedule_rounded, cor: c.navAtivo, fundo: c.navAtivoFundo),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(a.disciplina, style: AppTexto.corpoForte),
                        Text(
                          '${formatarHoraMin(a.inicioMin)} às ${formatarHoraMin(a.fimMin)}',
                          style: AppTexto.apoio.copyWith(color: c.secundario),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        if (todas != null && todas.isNotEmpty)
          BotaoContorno(
            texto: 'Adicionar à agenda',
            icone: Icons.event_rounded,
            cor: c.navAtivo,
            aoTocar: () => _adicionarAAgenda(context, todas),
          ),
      ],
    );
  }
}

/// Gera o .ics no celular e entrega ao Android: primeiro abre direto na agenda
/// (Google Agenda e afins importam o arquivo); sem app que abra, oferece compartilhar.
/// Nada sai do aparelho por conta do app.
Future<void> _adicionarAAgenda(BuildContext context, List<Aula> aulas) async {
  final mensageiro = ScaffoldMessenger.of(context);
  void avisar(String texto) => mensageiro
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(texto)));
  final ics = gerarIcs(aulas);
  if (ics.eventos == 0) return avisar('Não há aulas para adicionar à agenda.');
  try {
    final pasta = await Directory(caminho.join((await getTemporaryDirectory()).path, 'agenda')).create();
    final arquivo = File(caminho.join(pasta.path, 'aulas-ufac-plus.ics'));
    await arquivo.writeAsString(ics.texto, flush: true);
    final aberto = await OpenFilex.open(arquivo.path, type: 'text/calendar');
    if (aberto.type != ResultType.done) {
      final r = await SharePlus.instance.share(
        ShareParams(
          files: [XFile(arquivo.path, mimeType: 'text/calendar')],
          title: 'Aulas (UFAC+)',
        ),
      );
      if (r.status == ShareResultStatus.dismissed) return; // a pessoa fechou a folha
    }
  } on Exception {
    return avisar('Não consegui criar o arquivo da agenda agora.');
  }
  // Sem o fim do período no portal, as aulas repetem por 4 meses.
  if (ics.prazoPadrao) avisar('As aulas se repetem por 4 meses, porque o portal não informa o fim do período.');
}

class _ChipDia extends StatelessWidget {
  const _ChipDia({required this.nome, required this.ativo, required this.hoje, required this.aoTocar});

  final String nome;
  final bool ativo, hoje;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    return Material(
      color: ativo ? c.navAtivoFundo : c.superficie,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppMedidas.raioBotao),
        side: BorderSide(color: hoje ? c.navAtivo : c.borda),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: aoTocar,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppMedidas.toqueMinimo),
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(nome, style: AppTexto.rotulo.copyWith(color: ativo ? c.navAtivo : c.secundario)),
            ),
          ),
        ),
      ),
    );
  }
}
