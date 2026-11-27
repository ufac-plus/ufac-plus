import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../data/perfil.dart';
import '../data/registro.dart';
import '../data/repositorio_portal.dart';
import '../data/repositorio_professor.dart';
import '../data/repositorio_ru.dart';
import '../session/regras_sessao.dart';
import '../session/sessao.dart';
import '../theme/app_cores.dart';
import '../theme/app_medidas.dart';
import '../theme/app_texto.dart';
import '../ui/componentes.dart';
import '../ui/tela_atual.dart';

/// Versão, aparelho, tela e, se houver, a parte técnica (estado do app e eventos anonimizados).
/// Nunca CPF, matrícula, QR, notas, cookies ou prints.
String montarRelato({
  required String versao,
  required String modelo,
  required String android,
  required String tela,
  String tecnico = '',
}) =>
    'Olá! Encontrei um problema no UFAC+.\n\n'
    'O que aconteceu?\n\n\n'
    '---\n'
    'Versão do app: $versao\n'
    'Celular: $modelo\n'
    'Android: $android\n'
    'Tela: $tela'
    '${tecnico.isEmpty ? '' : '\n\n--- Informações técnicas (sem nome, CPF, matrícula ou senha) ---\n$tecnico'}';

/// O link de WhatsApp ou e-mail fica longo demais acima disso: corta os eventos mais antigos.
const _limiteTecnico = 4500;

String _hora(DateTime? d) {
  if (d == null) return 'não';
  String p(int n) => n.toString().padLeft(2, '0');
  return '${p(d.day)}/${p(d.month)} ${p(d.hour)}:${p(d.minute)}';
}

/// Estado do app sem dados da pessoa: o que está conectado, o que venceu, quando cada coisa foi lida.
Future<String> textoTecnico() async {
  final sessao = Sessao.instancia;
  final portal = RepositorioPortal.instancia;
  final conectados = [for (final s in Sistema.values) if (sessao.conectado(s)) s.name].join(', ');
  final vencidas = sessao.expirados.map((s) => s.name).join(', ');
  final cabeca = [
    'Perfil: ${Perfil.instancia.atual.name} · Conectados: $conectados · '
        'Sessão vencida: ${vencidas.isEmpty ? 'nenhuma' : vencidas}'
        '${sessao.portalPedeSenha ? ' · Portal pede troca de senha' : ''}',
    'Dados salvos: identificação ${portal.identificacao == null ? 'não' : 'sim'}, '
        'notas ${_hora(portal.notasLidasEm)}, saldo ${_hora(RepositorioRu.instancia.atualizadoEm)}, '
        'professor ${_hora(RepositorioProfessor.instancia.lidoEm)}',
    'Eventos (mais recentes no fim):',
  ].join('\n');
  final linhas = [for (final e in await Registro.instancia.eventos()) e.linha];
  while (linhas.isNotEmpty && cabeca.length + linhas.join('\n').length > _limiteTecnico) {
    linhas.removeAt(0);
  }
  return '$cabeca\n${linhas.isEmpty ? '(nenhum evento registrado)' : linhas.join('\n')}';
}

Future<String> _relatoDesteCelular() async {
  final pacote = await PackageInfo.fromPlatform();
  var modelo = 'não informado';
  var android = Platform.operatingSystemVersion;
  if (Platform.isAndroid) {
    final info = await DeviceInfoPlugin().androidInfo;
    modelo = '${info.manufacturer} ${info.model}';
    android = info.version.release;
  }
  return montarRelato(
    versao: pacote.version,
    modelo: modelo,
    android: android,
    tela: telaAtual,
    tecnico: await textoTecnico(),
  );
}

Future<void> _abrir(BuildContext context, Uri destino) async {
  final mensageiro = ScaffoldMessenger.of(context);
  final abriu = await launchUrl(destino, mode: LaunchMode.externalApplication);
  if (!abriu) {
    mensageiro.showSnackBar(const SnackBar(content: Text('Não consegui abrir esse app neste celular.')));
  }
}

/// A pessoa revisa a mensagem no WhatsApp ou no e-mail e envia ela mesma.
Future<void> abrirRelatar(BuildContext context) async {
  final c = context.cores;
  final relato = await _relatoDesteCelular();
  if (!context.mounted) return;
  final telefone = contatoWhatsapp.replaceAll(RegExp(r'\D'), '');
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: c.superficie,
    builder: (folha) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppMedidas.margem),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Relatar um problema', style: AppTexto.tituloCartao),
            const SizedBox(height: 4),
            Text(
              'A mensagem abre pronta com a versão do app, o modelo do celular e um registro técnico do que deu errado, '
              'sem nome, CPF, matrícula ou senha. Você revisa e envia.',
              style: AppTexto.apoio.copyWith(color: c.secundario),
            ),
            const SizedBox(height: 14),
            if (telefone.isEmpty && contatoEmail.isEmpty)
              Text(
                'O contato ainda não foi configurado nesta versão do app.',
                style: AppTexto.corpo.copyWith(color: c.secundario),
              ),
            if (telefone.isNotEmpty)
              BotaoContorno(
                texto: 'WhatsApp',
                icone: Icons.chat_rounded,
                cor: c.navAtivo,
                aoTocar: () {
                  Navigator.of(folha).pop();
                  _abrir(context, Uri.https('wa.me', '/$telefone', {'text': relato}));
                },
              ),
            if (telefone.isNotEmpty && contatoEmail.isNotEmpty) const SizedBox(height: 10),
            if (contatoEmail.isNotEmpty)
              BotaoContorno(
                texto: 'E-mail',
                icone: Icons.mail_rounded,
                cor: c.navAtivo,
                aoTocar: () {
                  Navigator.of(folha).pop();
                  final assunto = Uri.encodeComponent('Problema no UFAC+');
                  _abrir(context, Uri.parse('mailto:$contatoEmail?subject=$assunto&body=${Uri.encodeComponent(relato)}'));
                },
              ),
          ],
        ),
      ),
    ),
  );
}
