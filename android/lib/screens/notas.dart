import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../config.dart';
import '../data/academico.dart';
import '../data/repositorio_portal.dart';
import '../theme/app_cores.dart';
import '../theme/app_medidas.dart';
import '../theme/app_texto.dart';
import '../ui/componentes.dart';
import '../ui/formatos.dart';
import 'acoes_portal.dart';
import 'aviso_faltas.dart';
import 'menu.dart';

class TelaNotas extends StatefulWidget {
  const TelaNotas({super.key});

  @override
  State<TelaNotas> createState() => _TelaNotasState();
}

class _TelaNotasState extends State<TelaNotas> {
  /// Null é o semestre atual. A aba sempre abre nele.
  String? _escolhido;

  final _portal = RepositorioPortal.instancia;

  /// Se a Ufac virou o semestre e o escolhido passou a ser o atual, ele volta a ser "o atual".
  String? get _visto => _escolhido == _portal.semestreDasNotas ? null : _escolhido;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: _portal, builder: (context, _) => _construir(context));
  }

  Future<void> _escolher() async {
    final atual = _portal.semestreDasNotas;
    final nome = await _escolherSemestre(context, _portal.listaDeSemestres, _visto ?? atual);
    if (nome == null || !mounted) return;
    final novo = nome == _portal.semestreDasNotas ? null : nome;
    if (novo == _visto) return;
    setState(() => _escolhido = novo);
    final view = View.of(context);
    SemanticsService.sendAnnouncement(view, 'Mostrando ${semestreCurto(nome)}', Directionality.of(context));
    // Semestre encerrado já lido: abre do cache, sem pedir nada à Ufac.
    if (novo != null && _portal.precisaLer(novo)) await _atualizarAnterior(novo);
  }

  /// Puxar para atualizar e "Tentar de novo" releem o semestre que está na tela.
  Future<void> _atualizar() async {
    final alvo = _visto;
    if (alvo == null) return atualizarPortal(context);
    return _atualizarAnterior(alvo);
  }

  Future<void> _atualizarAnterior(String nome) async {
    final mensageiro = ScaffoldMessenger.of(context);
    final resultado = await _portal.atualizarSemestre(nome);
    // A pessoa pode ter trocado de semestre enquanto este era lido: o aviso é só do que está na tela.
    if (!mounted || resultado == ResultadoPortal.atualizado || _visto != nome) return;
    final expirou = resultado == ResultadoPortal.sessaoExpirada;
    mensageiro
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            expirou
                ? 'Para ler as notas deste semestre, entre de novo no Portal.'
                : 'Não consegui ler as notas deste semestre agora.',
          ),
          action: expirou
              ? SnackBarAction(
                  label: 'Entrar',
                  onPressed: () => entrarNoPortal(context, aoEntrar: () => _atualizarAnterior(nome)),
                )
              : SnackBarAction(label: 'Tentar de novo', onPressed: () => _atualizarAnterior(nome)),
        ),
      );
  }

  Widget _construir(BuildContext context) {
    final c = context.cores;
    final portal = _portal;
    final visto = _visto;
    final semestres = portal.listaDeSemestres;
    final s = portal.semestreEmCache(visto);
    final nome = visto ?? portal.semestreDasNotas;
    final lidas = s?.lidasEm;
    return ListaDaTela(
      aoAtualizar: _atualizar,
      children: [
        CabecalhoTela(
          titulo: 'Notas',
          subtitulo: semestres.length < 2 ? portal.semestreDasNotas : null,
          abaixo: semestres.length < 2 || nome == null ? null : _PilulaSemestre(semestre: nome, aoTocar: _escolher),
          acoes: [BotaoRedondo(icone: Icons.menu_rounded, descricao: 'Menu', aoTocar: () => abrirMenu(context))],
        ),
        if (lidas != null)
          Text(
            'Lidas em ${formatarDiaHora(lidas)}. Puxe para atualizar.',
            style: AppTexto.rotulo.copyWith(color: c.secundario),
          ),
        if (s == null)
          if (portal.lendoSemestre(visto)) ...[
            for (var i = 0; i < 2; i++) const Skeleton(altura: 110, raio: AppMedidas.raioCartao),
          ] else if (visto == null)
            Cartao(
              child: EstadoVazio(
                icone: Icons.grading_rounded,
                titulo: 'Ainda não li suas notas',
                texto: 'Entre no Portal do Aluno para ver as notas deste semestre.',
                acao: BotaoContorno(texto: 'Entrar no Portal', cor: c.navAtivo, aoTocar: () => entrarNoPortal(context)),
              ),
            )
          else
            Cartao(
              child: EstadoVazio(
                icone: Icons.grading_rounded,
                titulo: 'Ainda não li as notas deste semestre',
                texto: 'Puxe para baixo para tentar de novo.',
                acao: BotaoContorno(texto: 'Tentar de novo', cor: c.navAtivo, aoTocar: () => _atualizarAnterior(visto)),
              ),
            )
        else if (s.disciplinas.isEmpty)
          const Cartao(
            child: EstadoVazio(icone: Icons.grading_rounded, titulo: 'Sem disciplinas neste semestre'),
          )
        else ...[
          for (final n in s.disciplinas) _CartaoNota(nota: n, atual: s.atual),
          Text(
            'É preciso ter 75% de frequência. As faltas permitidas dependem da carga horária de cada disciplina: '
            '${faltasPermitidas(72)} numa de 72 h, ${faltasPermitidas(36)} numa de 36 h.',
            style: AppTexto.rotulo.copyWith(color: c.secundario),
          ),
        ],
      ],
    );
  }
}

/// Pílula do cabeçalho que abre a lista de semestres.
class _PilulaSemestre extends StatelessWidget {
  const _PilulaSemestre({required this.semestre, required this.aoTocar});

  final String semestre;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final curto = semestreCurto(semestre);
    // O nome acessível começa pelo texto visível, para o comando de voz achar "2º / 2026".
    return Semantics(
      container: true,
      button: true,
      label: '$curto, trocar semestre',
      onTap: aoTocar,
      excludeSemantics: true,
      child: Material(
        color: c.chrome,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: aoTocar,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppMedidas.toqueMinimo),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(curto, style: AppTexto.corpoForte.copyWith(color: c.texto)),
                  const SizedBox(width: 4),
                  Icon(Icons.expand_more_rounded, size: 20, color: c.texto),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Folha com todos os semestres da página, o mais recente no topo. Devolve o nome escolhido (ou null).
Future<String?> _escolherSemestre(
  BuildContext context,
  List<({String semestre, bool atual})> semestres,
  String? visto,
) {
  final c = context.cores;
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: c.superficie,
    isScrollControlled: true,
    builder: (folha) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppMedidas.margem),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Semestre', style: AppTexto.tituloCartao),
            const SizedBox(height: 8),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final s in semestres)
                    Semantics(
                      selected: s.semestre == visto,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(AppMedidas.raioBotao),
                        onTap: () => Navigator.of(folha).pop(s.semestre),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: 52),
                          child: Row(
                            children: [
                              Expanded(child: Text(semestreCurto(s.semestre), style: AppTexto.corpoForte)),
                              if (s.atual) Selo(texto: 'Atual', cor: c.navAtivo, fundo: c.navAtivoFundo),
                              if (s.semestre == visto) ...[
                                const SizedBox(width: 10),
                                Icon(Icons.check_rounded, color: c.navAtivo, semanticLabel: 'Selecionado'),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            BotaoContorno(texto: 'Fechar', cor: c.navAtivo, aoTocar: () => Navigator.of(folha).pop()),
          ],
        ),
      ),
    ),
  );
}

class _CartaoNota extends StatelessWidget {
  const _CartaoNota({required this.nota, required this.atual});

  final NotasDisciplina nota;

  /// Só o semestre atual tem "quanto preciso no exame".
  final bool atual;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final aprovado =
        nota.situacao.toLowerCase().contains('aprovado') && !nota.situacao.toLowerCase().contains('reprovado');
    return Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(nota.disciplina, style: AppTexto.corpoForte)),
              const SizedBox(width: 8),
              Selo(
                texto: nota.situacaoApresentavel,
                cor: aprovado ? c.verde : c.navAtivo,
                fundo: aprovado ? c.verdeFundo : c.navAtivoFundo,
              ),
            ],
          ),
          // O mesmo quadro que o portal mostra ao abrir as notas da disciplina.
          for (final a in nota.notas) ...[
            const SizedBox(height: 12),
            Text(
              a.peso.isEmpty ? a.rotulo : '${a.rotulo} · peso ${_pesoCurto(a.peso)}',
              style: AppTexto.rotulo.copyWith(color: c.secundario),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 20,
              runSpacing: 10,
              children: [
                for (final i in a.itens) _Valor(rotulo: i.rotulo, detalhe: _pesoCurto(i.peso), valor: i.valor),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Divider(height: 1, color: c.borda),
          const SizedBox(height: 12),
          Wrap(
            spacing: 20,
            runSpacing: 10,
            children: [
              if (nota.resumo.isEmpty) _Valor(rotulo: 'Média Final', valor: nota.media),
              for (final i in nota.resumo) _Valor(rotulo: i.rotulo, valor: i.valor),
              _Valor(rotulo: 'Faltas', valor: nota.faltas),
            ],
          ),
          if (exameDaDisciplina(nota, atual: atual) case final exame?) ...[
            const SizedBox(height: 12),
            _CaixaExame(exame: exame),
          ],
          const SizedBox(height: 10),
          AvisoFaltas(nota: nota),
          if (_detalheFaltas(nota) case final detalhe?) ...[
            const SizedBox(height: 6),
            Text(detalhe, style: AppTexto.rotulo.copyWith(color: c.secundario)),
          ],
        ],
      ),
    );
  }
}

/// Frequência em porcentagem (issue #13). Sem a carga horária da turma, o limite é o de uma disciplina de 60 h:
/// deixar claro que é estimativa.
String? _detalheFaltas(NotasDisciplina nota) {
  final s = situacaoFaltas(nota.faltas, cargaHoraria: nota.cargaHoraria, permitidasSemCarga: limiteFaltas);
  if (s == null) return null;
  if (s.estimado) return 'Estimativa: não consegui ler a carga horária desta disciplina.';
  return 'Frequência ${s.frequencia}% · carga de ${s.cargaHoraria} h · a ${s.permitidas + 1}ª falta reprova';
}

/// Nota mínima no exame, com a regra citada. Só fala da nota: aprovação e reprovação quem diz é o portal.
class _CaixaExame extends StatelessWidget {
  const _CaixaExame({required this.exame});

  final ExameNecessario exame;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.chipFundo, borderRadius: BorderRadius.circular(AppMedidas.raioBotao)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Para passar, você precisa de pelo menos ${formatarNota(exame.necessaria)} no exame',
            style: AppTexto.corpoForte.copyWith(color: c.chipTexto),
          ),
          const SizedBox(height: 4),
          Text(
            'Média parcial ${formatarNota(exame.mediaParcial, 2)}. Média final = (média parcial + exame) ÷ 2, e passa '
            'quem chega a 5, com 75% de frequência (Regimento Geral da Ufac, arts. 319 e 320).',
            style: AppTexto.apoio.copyWith(color: c.chipTexto),
          ),
        ],
      ),
    );
  }
}

/// "100.00%" vira "100%"; "33.33%" fica igual.
String _pesoCurto(String peso) => peso.replaceFirst(RegExp(r'[.,]00%$'), '%');

class _Valor extends StatelessWidget {
  const _Valor({required this.rotulo, required this.valor, this.detalhe = ''});

  final String rotulo, valor, detalhe;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(rotulo, style: AppTexto.rotulo.copyWith(color: c.secundario)),
        if (detalhe.isNotEmpty) Text(detalhe, style: AppTexto.rotulo.copyWith(color: c.secundario)),
        const SizedBox(height: 2),
        Text(valor.isEmpty ? '–' : valor, style: AppTexto.tituloCartao),
      ],
    );
  }
}
