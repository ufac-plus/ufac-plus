import 'package:flutter/material.dart';

import '../theme/app_cores.dart';
import '../theme/app_texto.dart';
import '../ui/componentes.dart';

/// Quem faz o UFAC+ e o que cada um fez. Mesmo texto do iPhone e da seção "Créditos" do site.
class _Pessoa {
  const _Pessoa(this.iniciais, this.nome, this.papel, this.texto, {this.ambar = false});
  final String iniciais, nome, papel, texto;
  final bool ambar;
}

const _pessoas = [
  _Pessoa(
    'AH',
    'Arthur Henrique de Souza Cavalcante Ferreira',
    'Idealizador e criador',
    'Idealizou e criou o UFAC+, desenhou as telas e desenvolve o app para Android.',
  ),
  _Pessoa(
    'MB',
    'Matheus Barros Cardoso',
    'Colaborador · versão iPhone',
    'Implementou recursos do app, levou o UFAC+ inteiro para o iPhone como app da web e colabora no site.',
    ambar: true,
  ),
];

class TelaCreditos extends StatelessWidget {
  const TelaCreditos({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.cores;
    return Scaffold(
      body: ListaDaTela(
        children: [
          Row(
            children: [
              BotaoRedondo(
                icone: Icons.arrow_back_rounded,
                descricao: 'Voltar',
                aoTocar: () => Navigator.of(context).maybePop(),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Créditos', style: AppTexto.tituloTela),
                    Text('Quem faz o UFAC+', style: AppTexto.apoio.copyWith(color: c.secundario)),
                  ],
                ),
              ),
            ],
          ),
          for (final p in _pessoas)
            Cartao(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 52,
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: p.ambar ? c.chipFundo : c.navAtivoFundo,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        p.iniciais,
                        style: AppTexto.tituloCartao.copyWith(color: p.ambar ? c.chipTexto : c.navAtivo),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.nome, style: AppTexto.tituloCartao),
                        const SizedBox(height: 2),
                        Text(p.papel, style: AppTexto.rotulo.copyWith(color: c.navAtivo)),
                        const SizedBox(height: 6),
                        Text(p.texto, style: AppTexto.apoio.copyWith(color: c.secundario)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ItemLista(
            icone: Icons.code_rounded,
            corIcone: c.navAtivo,
            fundoIcone: c.navAtivoFundo,
            titulo: 'Código aberto no GitHub',
            subtitulo: 'github.com/ufac-plus/ufac-plus',
            aoTocar: () => abrirForaDoApp(
              context,
              Uri.parse('https://github.com/ufac-plus/ufac-plus'),
              falha: 'Não consegui abrir o navegador neste celular.',
            ),
          ),
          Text(
            'App independente, feito por alunos. Não é um aplicativo oficial da Ufac.',
            style: AppTexto.rotulo.copyWith(color: c.secundario),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
