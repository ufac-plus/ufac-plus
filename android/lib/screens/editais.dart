import 'package:flutter/material.dart';

import '../data/editais.dart';
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
    setState(() => _fonte = f);
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
    return [
      if (lidos.lista.isEmpty)
        Cartao(
          child: EstadoVazio(
            icone: Icons.campaign_rounded,
            titulo: 'Nenhum edital publicado ainda',
            texto: 'A ${_fonte.nome} ainda não publicou editais em ${lidos.ano}.',
          ),
        )
      else ...[
        Text(
          '${contagemEditais(lidos.lista.length, lidos.ano)} · ${rotuloLidoEm(lidos.lidoEm, agora)}',
          style: AppTexto.rotulo.copyWith(color: c.secundario),
        ),
        for (final e in lidos.lista)
          _LinhaEdital(
            icone: Icons.campaign_rounded,
            titulo: e.titulo,
            subtitulo: rotuloDatas(e, agora),
            aoTocar: () => _abrir(e.url),
          ),
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

/// Edital tocável: título, datas embaixo e o ícone de "abre fora do app".
class _LinhaEdital extends StatelessWidget {
  const _LinhaEdital({required this.icone, required this.titulo, required this.subtitulo, required this.aoTocar});

  final IconData icone;
  final String titulo, subtitulo;
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
