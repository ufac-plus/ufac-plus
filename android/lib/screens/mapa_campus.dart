import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../config.dart';
import '../data/mapa_campus.dart';
import '../theme/app_cores.dart';
import '../theme/app_medidas.dart';
import '../theme/app_texto.dart';
import '../ui/componentes.dart';

/// Mapa do Campus Sede desenhado pelo app (fluido), com os prédios da lista pública da Ufac.
/// O fundo é do OpenStreetMap, como no site oficial; nenhum dado da pessoa vai junto.
class TelaMapaCampus extends StatefulWidget {
  const TelaMapaCampus({super.key, this.repositorio});

  final RepositorioMapaCampus? repositorio;

  /// Os testes desligam o fundo (as imagens do mapa vêm da internet).
  @visibleForTesting
  static bool mostrarFundo = true;

  @override
  State<TelaMapaCampus> createState() => _TelaMapaCampusState();
}

class _TelaMapaCampusState extends State<TelaMapaCampus> {
  final _mapa = MapController();
  final _busca = TextEditingController();
  List<LocalCampus>? _locais;
  bool _carregando = true;
  String _termo = '';
  LocalCampus? _escolhido;
  Campus _campus = Campus.sede;

  RepositorioMapaCampus get _repo => widget.repositorio ?? RepositorioMapaCampus.instancia;

  void _trocarCampus(Campus novo) {
    if (novo == _campus) return;
    setState(() {
      _campus = novo;
      _locais = null;
      _termo = '';
      _busca.clear();
    });
    _mapa.move(LatLng(novo.centro.$1, novo.centro.$2), novo.zoom);
    _carregar();
  }

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _busca.dispose();
    _mapa.dispose();
    super.dispose();
  }

  Future<void> _carregar({bool forcar = false}) async {
    setState(() => _carregando = true);
    final pedido = _campus;
    final lidos = await _repo.locais(campus: pedido, forcar: forcar);
    // Trocou de campus enquanto lia: esta resposta não vale mais.
    if (!mounted || pedido != _campus) return;
    setState(() {
      _locais = lidos ?? _locais;
      _carregando = false;
    });
  }

  void _escolher(LocalCampus l) {
    FocusScope.of(context).unfocus();
    setState(() {
      _escolhido = l;
      _termo = '';
      _busca.clear();
    });
    _mapa.move(LatLng(l.latitude, l.longitude), 18);
    _mostrarFicha(l);
  }

  Future<void> _mostrarFicha(LocalCampus l) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (folha) => SafeArea(child: _FichaLocal(local: l)),
    );
    if (mounted) setState(() => _escolhido = null);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final locais = _locais;
    final achados = _termo.isEmpty || locais == null
        ? const <LocalCampus>[]
        : locais.where((l) => l.combina(_termo)).take(6).toList();
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _mapa,
              options: MapOptions(
                initialCenter: LatLng(Campus.sede.centro.$1, Campus.sede.centro.$2),
                initialZoom: Campus.sede.zoom,
                minZoom: 14,
                maxZoom: 19,
                backgroundColor: c.fundo,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
                onTap: (_, _) => FocusScope.of(context).unfocus(),
              ),
              children: [
                if (TelaMapaCampus.mostrarFundo)
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'io.github.ufacnobolso.ufac_no_bolso',
                    maxNativeZoom: 19,
                  ),
                if (locais != null)
                  MarkerLayer(
                    markers: [
                      for (final l in locais)
                        Marker(
                          point: LatLng(l.latitude, l.longitude),
                          width: 46,
                          height: 46,
                          child: _Marcador(local: l, escolhido: l == _escolhido, aoTocar: () => _escolher(l)),
                        ),
                    ],
                  ),
                if (TelaMapaCampus.mostrarFundo) const SimpleAttributionWidget(source: Text('OpenStreetMap')),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      BotaoRedondo(
                        icone: Icons.arrow_back_rounded,
                        descricao: 'Voltar',
                        aoTocar: () => Navigator.of(context).maybePop(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Material(
                          color: c.superficie,
                          elevation: 2,
                          borderRadius: BorderRadius.circular(AppMedidas.raioBotao),
                          child: TextField(
                            controller: _busca,
                            onChanged: (t) => setState(() => _termo = t),
                            textInputAction: TextInputAction.search,
                            onSubmitted: (_) {
                              if (achados.isNotEmpty) _escolher(achados.first);
                            },
                            decoration: InputDecoration(
                              hintText: 'Buscar prédio, setor ou código',
                              prefixIcon: const Icon(Icons.search_rounded),
                              suffixIcon: _termo.isEmpty
                                  ? null
                                  : IconButton(
                                      tooltip: 'Limpar',
                                      icon: const Icon(Icons.close_rounded),
                                      onPressed: () => setState(() {
                                        _busca.clear();
                                        _termo = '';
                                      }),
                                    ),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Material(
                    color: c.superficie,
                    elevation: 2,
                    borderRadius: BorderRadius.circular(AppMedidas.raioBotao),
                    child: SeletorAbas(
                      rotulos: [for (final cp in Campus.values) cp.cidade],
                      atual: _campus.index,
                      aoEscolher: (i) => _trocarCampus(Campus.values[i]),
                    ),
                  ),
                  if (_termo.isNotEmpty && locais != null) ...[
                    const SizedBox(height: 8),
                    Material(
                      color: c.superficie,
                      elevation: 2,
                      borderRadius: BorderRadius.circular(AppMedidas.raioBotao),
                      clipBehavior: Clip.antiAlias,
                      child: achados.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.all(AppMedidas.interno),
                              child: Text(
                                'Nenhum prédio com esse nome',
                                style: AppTexto.apoio.copyWith(color: c.secundario),
                              ),
                            )
                          : Column(
                              children: [
                                for (final l in achados)
                                  ListTile(
                                    leading: CircleAvatar(
                                      backgroundColor: c.navAtivoFundo,
                                      child: Text(l.codigo, style: AppTexto.rotulo.copyWith(color: c.navAtivo)),
                                    ),
                                    title: Text(
                                      l.titulo,
                                      style: AppTexto.corpoForte,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    subtitle: Text(
                                      [?l.setor, ?l.categoria].join(' · '),
                                      style: AppTexto.rotulo.copyWith(color: c.secundario),
                                    ),
                                    onTap: () => _escolher(l),
                                  ),
                              ],
                            ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_carregando && locais == null) const Positioned.fill(child: _Carregando()),
          if (!_carregando && locais == null)
            Positioned.fill(
              child: ColoredBox(
                color: c.fundo,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppMedidas.margem),
                    child: EstadoVazio(
                      icone: Icons.wifi_off_rounded,
                      titulo: 'Não consegui carregar o mapa agora',
                      texto: 'O servidor do mapa da Ufac não respondeu. Confira sua internet e tente de novo.',
                      acao: Column(
                        children: [
                          BotaoContorno(
                            texto: 'Tentar de novo',
                            cor: c.navAtivo,
                            aoTocar: () => _carregar(forcar: true),
                          ),
                          TextButton(
                            onPressed: () => abrirForaDoApp(
                              context,
                              Uri.parse(urlMapaCampus),
                              falha: 'Não consegui abrir o navegador neste celular.',
                            ),
                            child: const Text('Abrir o mapa oficial no navegador'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Marcador extends StatelessWidget {
  const _Marcador({required this.local, required this.escolhido, required this.aoTocar});

  final LocalCampus local;
  final bool escolhido;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final fundo = escolhido ? c.destaque : c.primaria;
    final texto = escolhido ? c.sobreDestaque : c.sobrePrimaria;
    return Semantics(
      button: true,
      label: '${local.codigo}, ${local.titulo}',
      child: GestureDetector(
        onTap: aoTocar,
        behavior: HitTestBehavior.opaque,
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            decoration: BoxDecoration(
              color: fundo,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: c.superficie, width: 1.5),
              boxShadow: const [BoxShadow(blurRadius: 3, color: Color(0x33000000))],
            ),
            child: Text(local.codigo, style: AppTexto.rotulo.copyWith(color: texto, fontSize: 11)),
          ),
        ),
      ),
    );
  }
}

class _FichaLocal extends StatelessWidget {
  const _FichaLocal({required this.local});

  final LocalCampus local;

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    final l = local;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppMedidas.margem, 0, AppMedidas.margem, AppMedidas.margem),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconeQuadrado(icone: Icons.location_city_rounded, cor: c.navAtivo, fundo: c.navAtivoFundo),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.titulo, style: AppTexto.tituloCartao),
                    Text([l.codigo, ?l.setor].join(' · '), style: AppTexto.apoio.copyWith(color: c.secundario)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (l.categoria != null) Selo(texto: l.categoria!, cor: c.navAtivo, fundo: c.navAtivoFundo),
              if (l.horario != null) Selo(texto: l.horario!, cor: c.chipTexto, fundo: c.chipFundo),
              for (final a in l.acessibilidade) Selo(texto: a, cor: c.verde, fundo: c.verdeFundo),
            ],
          ),
          if (l.descricao != null) ...[const SizedBox(height: 10), Text(l.descricao!, style: AppTexto.corpo)],
          const SizedBox(height: 14),
          BotaoDestaque(
            texto: 'Como chegar',
            icone: Icons.directions_walk_rounded,
            aoTocar: () => abrirForaDoApp(
              context,
              Uri.https('www.google.com', '/maps/dir/', {
                'api': '1',
                'destination': '${l.latitude},${l.longitude}',
                'travelmode': 'walking',
              }),
              falha: 'Não consegui abrir o Google Maps neste celular.',
            ),
          ),
        ],
      ),
    );
  }
}

class _Carregando extends StatelessWidget {
  const _Carregando();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.cores.fundo,
      child: const Padding(
        padding: EdgeInsets.fromLTRB(AppMedidas.margem, 90, AppMedidas.margem, AppMedidas.margem),
        child: Column(
          children: [
            Skeleton(altura: 280, raio: AppMedidas.raioCartao),
            SizedBox(height: 14),
            Skeleton(altura: 56, raio: AppMedidas.raioBotao),
          ],
        ),
      ),
    );
  }
}
