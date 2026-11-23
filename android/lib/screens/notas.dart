import 'package:flutter/material.dart';

import '../data/academico.dart';
import '../data/repositorio_portal.dart';
import '../data/semestres.dart';
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
  /// Semestre anterior escolhido no seletor. Null = o semestre atual.
  String? _escolhido;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RepositorioPortal.instancia,
      builder: (context, _) => _construir(context, RepositorioPortal.instancia),
    );
  }

  /// Folha com os semestres. Semestre encerrado já lido abre do cache, sem pedir nada à Ufac;
  /// senão, é lido agora (só nesse momento), com a sessão que já existe.
  Future<void> _trocarSemestre(RepositorioPortal portal, String? visto) async {
    final nome = await escolherSemestre(context, portal.opcoesDeSemestre, visto);
    if (nome == null || !mounted) return;
    final novo = nome == portal.semestreDasNotas ? null : nome;
    if (novo == _escolhido) return;
    setState(() => _escolhido = novo);
    if (novo != null && portal.precisaLer(novo)) await atualizarSemestreDoPortal(context, novo);
  }

  Widget _construir(BuildContext context, RepositorioPortal portal) {
    final c = context.cores;
    final opcoes = portal.opcoesDeSemestre;
    // "Limpar dados" ou "Sair" apagam a lista: volta para o atual.
    final escolhido = opcoes.any((o) => o.semestre == _escolhido && !o.atual) ? _escolhido : null;
    final semestre = portal.notasDoSemestre(escolhido);
    final notas = semestre?.disciplinas;
    final lendo = escolhido == null ? portal.carregando : portal.lendoSemestres.contains(escolhido);
    final visto = escolhido ?? portal.semestreDasNotas;
    return ListaDaTela(
      // Puxar para atualizar relê o semestre que está na tela; um encerrado só é relido assim.
      aoAtualizar: () => escolhido == null ? atualizarPortal(context) : atualizarSemestreDoPortal(context, escolhido),
      children: [
        CabecalhoTela(
          titulo: 'Notas',
          subtitulo: opcoes.length < 2 ? portal.semestreDasNotas : null,
          detalhe: opcoes.length < 2 || visto == null
              ? null
              : _PilulaSemestre(semestre: visto, aoTocar: () => _trocarSemestre(portal, visto)),
          acoes: [
            BotaoRedondo(icone: Icons.menu_rounded, descricao: 'Menu', aoTocar: () => abrirMenu(context)),
          ],
        ),
        if (semestre != null)
          Text(
            'Lidas em ${formatarDiaHora(semestre.lidoEm)}. Puxe para atualizar.',
            style: AppTexto.rotulo.copyWith(color: c.secundario),
          ),
        if (notas == null)
          lendo
              ? const _EsqueletoDisciplinas()
              : escolhido != null
                  ? Cartao(
                      child: EstadoVazio(
                        icone: Icons.grading_rounded,
                        titulo: 'Ainda não li as notas deste semestre',
                        texto: 'Puxe para baixo para tentar de novo.',
                        acao: BotaoContorno(
                          texto: 'Tentar de novo',
                          cor: c.navAtivo,
                          aoTocar: () => atualizarSemestreDoPortal(context, escolhido),
                        ),
                      ),
                    )
                  : Cartao(
                      child: EstadoVazio(
                        icone: Icons.grading_rounded,
                        titulo: 'Ainda não li suas notas',
                        texto: 'Entre no Portal do Aluno para ver as notas deste semestre.',
                        acao: BotaoContorno(
                          texto: 'Entrar no Portal',
                          cor: c.navAtivo,
                          aoTocar: () => entrarNoPortal(context),
                        ),
                      ),
                    )
        else if (notas.isEmpty)
          const Cartao(child: EstadoVazio(icone: Icons.grading_rounded, titulo: 'Nenhuma disciplina neste semestre'))
        else
          for (final n in notas) _CartaoNota(nota: n, atual: semestre!.atual),
        // Mesma nota de rodapé do iPhone: o limite de faltas depende da carga horária.
        if (notas != null && notas.isNotEmpty)
          Text(
            'É preciso ter 75% de frequência. As faltas permitidas dependem da carga horária de cada '
            'disciplina: 16 numa de 72 h, 8 numa de 36 h.',
            style: AppTexto.rotulo.copyWith(color: c.secundario),
          ),
      ],
    );
  }
}

/// Pílula do cabeçalho com o semestre visto ("2º / 2026"); abre a lista de semestres.
class _PilulaSemestre extends StatelessWidget {
  const _PilulaSemestre({required this.semestre, required this.aoTocar});

  final String semestre;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final curto = semestreCurto(semestre);
    // O nome acessível começa pelo texto visível, como no iPhone.
    return Semantics(
      button: true,
      label: '$curto, trocar semestre',
      excludeSemantics: true,
      child: Material(
        color: c.chrome,
        shape: const StadiumBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: aoTocar,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppMedidas.toqueMinimo),
            child: Padding(
              padding: const EdgeInsets.only(left: 14, right: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(curto, style: AppTexto.corpoForte.copyWith(color: c.texto)),
                  const SizedBox(width: 2),
                  Icon(Icons.expand_more_rounded, size: 22, color: c.secundario),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Folha com todos os semestres da página, o mais recente no topo, marcando o visto.
/// Devolve o nome escolhido, ou null se a pessoa fechou.
Future<String?> escolherSemestre(BuildContext context, List<OpcaoSemestre> semestres, String? visto) {
  final c = context.cores;
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: c.superficie,
    builder: (folha) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(folha).height * 0.7),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(AppMedidas.margem, 0, AppMedidas.margem, AppMedidas.margem),
          children: [
            Text('Semestre', style: AppTexto.tituloCartao),
            const SizedBox(height: 10),
            for (final s in semestres) _ItemSemestre(opcao: s, visto: s.semestre == visto),
            const SizedBox(height: 14),
            BotaoContorno(texto: 'Fechar', cor: c.navAtivo, aoTocar: () => Navigator.of(folha).pop()),
          ],
        ),
      ),
    ),
  );
}

class _ItemSemestre extends StatelessWidget {
  const _ItemSemestre({required this.opcao, required this.visto});

  final OpcaoSemestre opcao;
  final bool visto;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final curto = semestreCurto(opcao.semestre);
    return Semantics(
      selected: visto,
      button: true,
      child: Material(
        color: visto ? c.navAtivoFundo : Colors.transparent,
        borderRadius: BorderRadius.circular(AppMedidas.raioBotao),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).pop(opcao.semestre),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(curto, style: AppTexto.corpoForte.copyWith(color: visto ? c.navAtivo : c.texto)),
                  ),
                  if (opcao.atual) Selo(texto: 'Atual', cor: c.chipTexto, fundo: c.chipFundo),
                  if (visto) ...[
                    const SizedBox(width: 8),
                    Icon(Icons.check_rounded, color: c.navAtivo, size: 22),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Esqueleto no formato de uma disciplina: sem salto quando os dados chegam.
class _EsqueletoDisciplinas extends StatelessWidget {
  const _EsqueletoDisciplinas();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < 2; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: AppMedidas.entreCartoes),
            child: Cartao(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Skeleton(altura: 18, largura: 200),
                  SizedBox(height: 8),
                  Skeleton(altura: 12, largura: 110),
                  SizedBox(height: 16),
                  Skeleton(altura: 8),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _CartaoNota extends StatelessWidget {
  const _CartaoNota({required this.nota, required this.atual});

  final NotasDisciplina nota;

  /// Semestre atual: só nele aparece a caixa "precisa no exame".
  final bool atual;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final aprovado = nota.situacao.toLowerCase().contains('aprovado') && !nota.situacao.toLowerCase().contains('reprovado');
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
              children: [for (final i in a.itens) _Valor(rotulo: i.rotulo, detalhe: _pesoCurto(i.peso), valor: i.valor)],
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
          const SizedBox(height: 10),
          AvisoFaltas(nota: nota, mostrarDetalhe: true),
          _CaixaExame(nota: nota, atual: atual),
        ],
      ),
    );
  }
}

/// Nota mínima no exame, com a regra citada. Só fala da nota: aprovação e reprovação quem diz é o portal.
/// Mesma etiqueta âmbar do "começa em" (token chip), sem tom de alarme.
class _CaixaExame extends StatelessWidget {
  const _CaixaExame({required this.nota, required this.atual});

  final NotasDisciplina nota;
  final bool atual;

  @override
  Widget build(BuildContext context) {
    final e = exameDaDisciplina(nota, atual: atual);
    if (e == null) return const SizedBox.shrink();
    final c = context.cores;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Cartao(
        cor: c.chipFundo,
        preenchimento: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Para passar, você precisa de pelo menos ${formatarNota(e.necessaria)} no exame',
              style: AppTexto.corpoForte.copyWith(color: c.chipTexto),
            ),
            const SizedBox(height: 4),
            Text(
              'Média parcial ${formatarNota(e.mediaParcial, 2)}. Média final = (média parcial + exame) ÷ 2, '
              'e passa quem chega a 5, com 75% de frequência (Regimento Geral da Ufac, arts. 319 e 320).',
              style: AppTexto.apoio.copyWith(color: c.chipTexto),
            ),
          ],
        ),
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
