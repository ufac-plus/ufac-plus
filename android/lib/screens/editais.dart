import 'package:flutter/material.dart';

import '../data/aviso_monitoria.dart';
import '../data/editais.dart';
import '../data/editais_horas.dart';
import '../data/preferencias.dart';
import '../theme/app_cores.dart';
import '../theme/app_medidas.dart';
import '../theme/app_texto.dart';
import '../ui/componentes.dart';
import '../ui/formatos.dart';

/// Editais da Proaes, da Prograd e da Proex. Abre com o que já foi lido e só pede à Ufac quando o cache
/// venceu (6 horas) ou ao puxar para atualizar. Cada edital abre no navegador, na página oficial com os PDFs.
class TelaEditais extends StatefulWidget {
  TelaEditais({super.key, RepositorioEditais? repositorio}) : repositorio = repositorio ?? RepositorioEditais.instancia;

  final RepositorioEditais repositorio;

  @override
  State<TelaEditais> createState() => _TelaEditaisState();
}

class _TelaEditaisState extends State<TelaEditais> {
  var _fonte = FonteEditais.proaes;
  // Filtros do iPhone 1.8: só os que rendem horas complementares; na Prograd, só os de monitoria.
  var _filtroHoras = false;
  var _filtroMonitoria = false;
  final _lendo = <FonteEditais>{};
  final _falhas = <FonteEditais, TipoFalhaEditais>{};
  final _vistas = <FonteEditais>{};

  @override
  void initState() {
    super.initState();
    _carregar(_fonte);
  }

  Future<void> _carregar(FonteEditais f, {bool forcar = false}) async {
    if (_lendo.contains(f)) return;
    _vistas.add(f);
    setState(() {
      _lendo.add(f);
      _falhas.remove(f);
    });
    await widget.repositorio.carregarGuardados(f);
    if (mounted) setState(() {});
    TipoFalhaEditais? falha;
    try {
      await widget.repositorio.ler(f, forcar: forcar);
    } on FalhaEditais catch (e) {
      falha = e.tipo;
    } catch (_) {
      // Qualquer outro erro (ex.: ao gravar o cache) também encerra o esqueleto, com o aviso de leitura.
      falha = TipoFalhaEditais.naoLi;
    }
    if (!mounted) return;
    setState(() {
      _lendo.remove(f);
      if (falha != null) _falhas[f] = falha;
    });
  }

  void _escolher(int i) {
    final f = FonteEditais.values[i];
    if (f == _fonte) return;
    setState(() {
      _fonte = f;
      if (f != FonteEditais.prograd) _filtroMonitoria = false;
    });
    if (!_vistas.contains(f)) _carregar(f);
  }

  void _abrir(String url) {
    if (!linkDaUfac(url)) return;
    abrirForaDoApp(context, Uri.parse(url), falha: 'Não consegui abrir o navegador neste celular.');
  }

  Widget? _aviso(EditaisLidos? lidos) {
    final falha = _falhas[_fonte];
    if (falha == null || lidos == null) return null;
    final frase = falha == TipoFalhaEditais.semConexao
        ? 'Não consegui falar com o site da ${_fonte.nome} agora'
        : 'Não consegui ler os editais da ${_fonte.nome} agora';
    return FaixaAviso(
      icone: Icons.wifi_off_rounded,
      texto: '$frase. Mostrando a lista de ${formatarDiaHora(lidos.lidoEm)}.',
    );
  }

  List<Widget> _corpo(EditaisLidos? lidos) {
    final c = context.cores;
    if (lidos == null) {
      if (_lendo.contains(_fonte)) {
        return [for (var i = 0; i < 4; i++) const Skeleton(altura: 76, raio: AppMedidas.raioCartao)];
      }
      final semConexao = _falhas[_fonte] == TipoFalhaEditais.semConexao;
      return [
        Cartao(
          child: EstadoVazio(
            icone: semConexao ? Icons.wifi_off_rounded : Icons.campaign_rounded,
            titulo: semConexao
                ? 'Não consegui falar com o site da ${_fonte.nome} agora'
                : 'Não consegui ler os editais da ${_fonte.nome} agora',
            texto: 'Confira sua internet e tente de novo daqui a pouco.',
            acao: BotaoContorno(
              texto: 'Tentar de novo',
              icone: Icons.refresh_rounded,
              cor: c.navAtivo,
              aoTocar: () => _carregar(_fonte, forcar: true),
            ),
          ),
        ),
      ];
    }
    final agora = DateTime.now();
    final monitoria = _filtroMonitoria && _fonte == FonteEditais.prograd;
    final filtrando = _filtroHoras || monitoria;
    final lista = [
      for (final e in lidos.lista)
        if ((!_filtroHoras || horasComplementares(e) != null) && (!monitoria || ehEditalMonitoria(e))) e,
    ];
    return [
      if (lidos.lista.isEmpty)
        Cartao(
          child: EstadoVazio(
            icone: Icons.campaign_rounded,
            titulo: 'Nenhum edital publicado ainda',
            texto: 'A ${_fonte.nome} ainda não publicou editais em ${lidos.ano}.',
          ),
        )
      else if (lista.isEmpty)
        Cartao(
          child: EstadoVazio(
            icone: Icons.filter_alt_off_rounded,
            titulo: monitoria && !_filtroHoras
                ? 'Nenhum edital de monitoria agora'
                : 'Nenhum edital com horas complementares agora',
            texto: 'A ${_fonte.nome} não tem edital assim em ${lidos.ano}. Tire o filtro para ver todos.',
          ),
        )
      else ...[
        Text(
          '${filtrando ? '${lista.length} de ${lidos.lista.length} editais' : contagemEditais(lidos.lista.length, lidos.ano)}'
          ' · ${rotuloLidoEm(lidos.lidoEm, agora)}',
          style: AppTexto.rotulo.copyWith(color: c.secundario),
        ),
        for (final e in lista)
          _LinhaEdital(
            icone: Icons.campaign_rounded,
            titulo: e.titulo,
            subtitulo: rotuloDatas(e, agora),
            horas: horasComplementares(e)?.rotulo,
            aoTocar: () => _abrir(e.url),
          ),
        if (_filtroHoras)
          Text(notaHorasComplementares, style: AppTexto.rotulo.copyWith(color: c.secundario)),
      ],
      _LinhaEdital(
        icone: Icons.language_rounded,
        titulo: 'Todos os editais da ${_fonte.nome} de ${lidos.ano}',
        subtitulo: 'Página oficial, com os anexos e resultados',
        aoTocar: () => _abrir(enderecoPasta(_fonte, lidos.ano).toString()),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final lidos = widget.repositorio.guardados(_fonte);
    return Scaffold(
      body: ListaDaTela(
        aoAtualizar: () => _carregar(_fonte, forcar: true),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BotaoRedondo(
                icone: Icons.arrow_back_rounded,
                descricao: 'Voltar',
                aoTocar: () => Navigator.of(context).maybePop(),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: CabecalhoTela(titulo: 'Editais', subtitulo: 'Proaes, Prograd e Proex · site da Ufac'),
              ),
            ],
          ),
          SeletorAbas(
            rotulos: [for (final f in FonteEditais.values) f.nome],
            atual: _fonte.index,
            aoEscolher: _escolher,
          ),
          Text(_fonte.sobre, style: AppTexto.apoio.copyWith(color: c.secundario)),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilterChip(
                label: const Text('Horas complementares'),
                selected: _filtroHoras,
                onSelected: (v) => setState(() => _filtroHoras = v),
              ),
              if (_fonte == FonteEditais.prograd)
                FilterChip(
                  label: const Text('Monitoria'),
                  selected: _filtroMonitoria,
                  onSelected: (v) => setState(() => _filtroMonitoria = v),
                ),
            ],
          ),
          if (_fonte == FonteEditais.prograd) const _CartaoAvisoMonitoria(),
          ?_aviso(lidos),
          ..._corpo(lidos),
          Text(
            'Lista pública do site da Ufac: não usa seu login. Os editais e resultados abrem no navegador.',
            style: AppTexto.rotulo.copyWith(color: c.secundario),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

/// Liga e desliga o aviso de edital novo de monitoria (Prograd). Sem servidor: o app confere ao abrir.
class _CartaoAvisoMonitoria extends StatelessWidget {
  const _CartaoAvisoMonitoria();

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    return ListenableBuilder(
      listenable: Preferencias.instancia,
      builder: (context, _) => Cartao(
        child: Row(
          children: [
            IconeQuadrado(icone: Icons.notifications_active_rounded, cor: c.chipTexto, fundo: c.chipFundo),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Avisar quando abrir bolsa de monitoria', style: AppTexto.corpoForte),
                  Text(
                    'Ao abrir o app (no máximo a cada 6 h), confiro se saiu edital novo de monitoria na Prograd.',
                    style: AppTexto.rotulo.copyWith(color: c.secundario),
                  ),
                ],
              ),
            ),
            Switch(
              value: Preferencias.instancia.avisarMonitoria,
              onChanged: (v) => AvisoMonitoria.instancia.ligar(v),
            ),
          ],
        ),
      ),
    );
  }
}

/// Edital tocável: título, datas embaixo, horas complementares (se rende) e o ícone de "abre fora do app".
class _LinhaEdital extends StatelessWidget {
  const _LinhaEdital({
    required this.icone,
    required this.titulo,
    required this.subtitulo,
    required this.aoTocar,
    this.horas,
  });

  final IconData icone;
  final String titulo, subtitulo;
  final String? horas;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    return Semantics(
      button: true,
      hint: 'Abre no navegador',
      child: Cartao(
        aoTocar: aoTocar,
        child: Row(
          children: [
            IconeQuadrado(icone: icone, cor: c.navAtivo, fundo: c.navAtivoFundo),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titulo, style: AppTexto.corpoForte),
                  if (subtitulo.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(subtitulo, style: AppTexto.rotulo.copyWith(color: c.secundario)),
                  ],
                  if (horas != null) ...[
                    const SizedBox(height: 6),
                    Selo(texto: horas!, cor: c.verde, fundo: c.verdeFundo),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.open_in_new_rounded, color: c.secundario, size: 20),
          ],
        ),
      ),
    );
  }
}
