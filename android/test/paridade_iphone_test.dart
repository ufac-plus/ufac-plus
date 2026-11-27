// O que o Android passou a ter igual ao iPhone (1.2 a 1.5): aula pulada em feriado, leitura alternativa do
// número interno, aviso de senha vencida, registro de eventos anonimizado no relato e Créditos.
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufac_no_bolso/data/academico.dart';
import 'package:ufac_no_bolso/data/banco.dart';
import 'package:ufac_no_bolso/data/registro.dart';
import 'package:ufac_no_bolso/extractors/portal.dart';
import 'package:ufac_no_bolso/screens/creditos.dart';
import 'package:ufac_no_bolso/screens/relatar.dart';
import 'package:ufac_no_bolso/session/regras_sessao.dart';
import 'package:ufac_no_bolso/session/sessao.dart';
import 'package:ufac_no_bolso/theme/app_tema.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    Banco.memoria = {};
  });

  test('feriado: a próxima aula pula o dia (19/11/2026, Tratado de Petrópolis)', () {
    // 19/11/2026 é quinta (feriado); 20/11 é sexta (Consciência Negra, feriado). Aulas quinta e segunda às 19h.
    const quinta = Aula(disciplina: 'Direito Civil', diaSemana: 4, inicioMin: 19 * 60, fimMin: 20 * 60 + 40);
    const segunda = Aula(disciplina: 'Direito Penal', diaSemana: 1, inicioMin: 19 * 60, fimMin: 20 * 60 + 40);
    final p = proximaAula([quinta, segunda], DateTime(2026, 11, 19, 8))!;
    expect(p.aula.disciplina, 'Direito Penal', reason: 'no feriado não tem aula');
    expect(p.rotulo, 'segunda às 19h');
    // Num dia comum, a aula do dia aparece.
    expect(proximaAula([quinta, segunda], DateTime(2026, 11, 12, 8))!.rotulo, 'hoje às 19h');
  });

  group('número interno do portal (leitura alternativa, como no iPhone)', () {
    test('o campo escondido de sempre', () {
      expect(lerIdInterno('<input type="hidden" id="matricula" value="123456">'), '123456');
    });
    test('numa lista de seleção, vale a opção escolhida', () {
      expect(
        lerIdInterno('<select id="matricula"><option value="111">A</option><option value="222" selected>B</option></select>'),
        '222',
      );
    });
    test('sem o campo, aceita o número dos links só se todos forem o mesmo', () {
      const um = '<a href="/aluno/x.action?matricula=777">a</a><a href="/aluno/y.action?a=1&amp;matricula=777">b</a>';
      expect(lerIdInterno(um), '777');
      const dois = '<a href="/aluno/x.action?matricula=777">a</a><a href="/aluno/y.action?matricula=888">b</a>';
      expect(lerIdInterno(dois), isNull, reason: 'mais de um é ambíguo');
    });
  });

  test('senha vencida: o Portal prende em "Alterar Senha"', () {
    final u = Uri.parse('https://portal.ufac.br/usuario/usuario/usuario.action');
    expect(classificar(Sistema.portal, u), EstadoPagina.trocarSenha);
    expect(classificar(Sistema.professor, u), EstadoPagina.trocarSenha);
    expect(classificar(Sistema.biblioteca, u), EstadoPagina.trocarSenha);
    expect(classificar(Sistema.portal, Uri.parse('https://portal.ufac.br/aluno/index.action')), EstadoPagina.logado);
  });

  test('senha vencida liga a faixa; uma leitura que dá certo desliga', () async {
    final s = Sessao.instancia;
    s.leitor = (_, _) async => const PaginaLida.trocarSenha();
    await s.lerEMarcar(Sistema.portal);
    expect(s.portalPedeSenha, isTrue);
    s.leitor = (_, _) async => const PaginaLida(ResultadoVerificacao.ativa, '<html></html>');
    await s.lerEMarcar(Sistema.portal);
    expect(s.portalPedeSenha, isFalse);
  });

  group('registro de eventos (relato)', () {
    test('anonimiza CPF, e-mail e números longos; endereço sem parâmetros', () {
      expect(anonimizar('cpf 123.456.789-01 e mail a.b@ufac.br e id 123456'), 'cpf # e mail @ e id #');
      expect(semParametros('https://portal.ufac.br/aluno/nota.action?matricula=123456'), '/aluno/nota.action');
      expect(semParametros('https://portal.ufac.br/aluno/index.action;jsessionid=ABC'), '/aluno/index.action');
    });

    test('a leitura que falha entra no registro, sem o número interno', () async {
      await Registro.instancia.limpar();
      Sessao.instancia.leitor = (_, _) async => const PaginaLida(ResultadoVerificacao.expirada);
      await Sessao.instancia.lerEMarcar(Sistema.portal, url: 'https://portal.ufac.br/aluno/nota.action?matricula=987654');
      await Registro.instancia.registrar('app', {}); // espera a fila gravar
      final eventos = await Registro.instancia.eventos();
      final linha = eventos.firstWhere((e) => e.tipo == 'leitura').linha;
      expect(linha, contains('resultado=expirada'));
      expect(linha, contains('/aluno/nota.action'));
      expect(linha, isNot(contains('987654')));
    });

    test('guarda no máximo 60 eventos', () async {
      await Registro.instancia.limpar();
      for (var i = 0; i < 70; i++) {
        Registro.instancia.registrar('app', {'n': 'x'});
      }
      await Registro.instancia.registrar('app', {'n': 'fim'});
      expect(await Registro.instancia.eventos(), hasLength(Registro.maximo));
    });

    test('o relato leva a parte técnica, sem dados da pessoa', () {
      final r = montarRelato(versao: '0.1.15', modelo: 'moto', android: '15', tela: 'Notas', tecnico: 'Perfil: aluno');
      expect(r, contains('Informações técnicas (sem nome, CPF, matrícula ou senha)'));
      expect(r, contains('Perfil: aluno'));
    });
  });

  testWidgets('Créditos: quem faz o UFAC+', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: AppTema.claro, home: const TelaCreditos()));
    expect(find.text('Créditos'), findsOneWidget);
    expect(find.text('Idealizador e criador'), findsOneWidget);
    expect(find.text('Colaborador · versão iPhone'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
