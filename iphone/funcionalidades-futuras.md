# Funcionalidades futuras (ainda não implementadas)

Ideias combinadas entre Matheus e Arthur. Valem para o PWA do iPhone e, se der certo, para o app Android.
Nada aqui está pronto; cada item diz o que já se sabe e o que falta descobrir.

## 1. Pesquisa no acervo da Biblioteca

**O que é:** buscar livros no acervo da Ufac por título, autor ou assunto e ver em qual biblioteca está e
quantos exemplares existem.

**O que já se sabe (conferido em 12/11/2026):**
- A pesquisa é **pública**: não precisa de login. É um formulário GET:
  `https://portal.ufac.br/biblioteca/pesquisa/resultado.action?keyword=<termo>`.
- O Worker já aceita esse endereço (`/portal/biblioteca/...`, host `portal.ufac.br`), então não há nada novo do lado
  do servidor.
- A resposta é uma tabela HTML com as colunas `#`, Autor, Título, Ano e Biblioteca (ex.: "Biblioteca Central").
- A página é pesada: uma busca por "direito civil" devolveu ~600 KB e levou ~3 s. O texto vem sem acento em parte
  dos registros antigos ("Informacao Obrigatoria", "arbritagem").
- Sistema ASTEN (o mesmo do Portal). Mapa completo em `docs/reconhecimento.md`, seção "Biblioteca".

**Como seria no app:**
- Item "Biblioteca" no Menu (☰) abre uma tela com campo de busca e a lista de resultados (autor, título, ano, biblioteca).
- Um extrator novo em `web/src/lib/extratores/biblioteca.js`, com fixture anonimizada (a busca é pública, não tem
  dado pessoal) e teste, como os outros.
- Respeito à Ufac: buscar só quando a pessoa toca em "Buscar" (nada de busca a cada letra); guardar as últimas
  buscas no cache por algumas horas; mostrar só os primeiros resultados e "Ver mais" se a página trouxer muitos.
- Cuidado: o Worker devolve a página inteira (600 KB). Se pesar no 4G, o Worker pode recortar só a tabela antes
  de devolver.

**O que falta descobrir:**
- Se há paginação ou se a página sempre traz tudo.
- Se dá para filtrar por campo (autor, título) e por biblioteca (o formulário de `pesquisar.action` tem mais campos?).
- Se existe página de detalhe do título com exemplares disponíveis/emprestados e número de chamada (localização na
  estante). Isso é o mais útil para quem vai buscar o livro.

**Depois (precisa de login):** Meu Espaço, Renovação, Reservas e Histórico. Em 10/11 essas páginas davam erro 500;
em 11/11 abriram na conta do Arthur. Renovar livro é ação que muda dado: só com confirmação livro a livro.

## 2. Horário dos ônibus no campus

**O que é:** mostrar quando passa o próximo ônibus no campus da Ufac (linhas 501, 502 e 902, com a 902-1 agrupada).

**O que já se sabe:**
- Não há dado público de posição em tempo real nem API de horários em Rio Branco (`docs/decisoes.md`, 10/11/2026).
- Então a única forma viável é uma **tabela fixa** de horários, digitada a partir da tabela oficial.

**Como seria no app:**
- Um arquivo de horários fácil de editar (ex.: `web/src/lib/dominio/onibus.js`), com dias úteis, sábado e domingo
  separados e a data da tabela ("horários de [data]").
- Cartão "Próximo ônibus" (opcional) na Início, e uma tela com a tabela completa por linha.
- Sempre avisar que é a tabela oficial e pode haver atraso; nunca dizer "o ônibus está chegando".
- Feriados: usar a lista de feriados que o app já tem para mostrar a tabela de domingo/feriado.

**O que falta:**
- Conseguir a tabela oficial (RBTrans / Prefeitura de Rio Branco ou as empresas das linhas) e a data dela.
- Saber qual parada fica dentro do campus e se os horários são de saída do terminal ou de passagem no campus.
- Definir quem atualiza a tabela quando ela mudar (a cada mudança, nova versão do app).

**Atualização da pesquisa de 21/11/2026 (continua fora do app):**
- O único documento oficial achado é o "Projeto Operacional Preliminar – POP" da Prefeitura/RBTrans, de 20/05/2026
  (https://www.riobranco.ac.gov.br/wp-content/uploads/2026/06/04-POP-Plano-Operacional.docx). Ele lista as linhas do
  novo SITURB que passam na Ufac (501 UFAC, 501-1 UFAC Domingo, 502 Universitário, 901 UFAC/Rodoviária, 902
  IFAC/Universidades e 902-1), com itinerário, frota e número de viagens por dia, mas **sem quadro de horários de
  partida**, e avisa que a programação pode mudar nos primeiros 30 dias.
- A operação mudou de empresa em outubro de 2026 (JTP). Os horários que aparecem na web vêm do Moovit: não são
  oficiais e provavelmente são da rede antiga. **Não usar.**
- Só voltar ao assunto com a tabela oficial, com data.

## 3. Onde fica o bloco (Mapa do Campus)

**Já no app (21/11/2026):** atalho "Mapa do campus" no Menu, que abre o mapa oficial (https://sistemas.ufac.br/mapa/)
no Safari. Nada é lido pelo app.

**O que já se sabe:**
- O mapa tem uma API JSON pública: `GET https://sistemas.ufac.br/mapa/api/locais/` devolve `{ total, locais[] }`
  (141 locais em 21/11/2026: 114 no campus SEDE e 27 no FLORESTA), com `codigo` (ex.: D02), `titulo`, `subtitulo`
  (setor), `setores_internos`, `descricao`, `horario`, `categoria`, `acessibilidade`, `total_salas`, `latitude`,
  `longitude` e `foto_url`. Há também `/mapa/api/busca/?q=` (fragmentos HTML) e `/mapa/api/rotas/`.
- **Sem CORS:** o iPhone não lê direto. Seria preciso o Worker (hoje ele só aceita `/eticket` em sistemas.ufac.br) ou
  um retrato embutido no app, com a data.
- **Cuidado:** existe `/mapa/api/telemetria/destino/`. O app nunca deve chamar esse endereço.

**Como seria no app:** busca por bloco ou setor dentro do app, com o horário de funcionamento que a própria Ufac
informa e o botão "Abrir no Mapas". Liberar no Worker só o GET de `/mapa/api/locais/`, com cache de um dia.

**O que falta:** decidir entre Worker e retrato embutido; conferir se os campos `horario` estão preenchidos e
atualizados; fixture anonimizada (a lista é pública) e teste.

## 4. Sala da turma por semestre

**O que é:** mostrar em que bloco e sala cada turma tem aula (o Portal não informa a sala).

**O que já se sabe:** o NURCA publica a "Distribuição do Espaço Físico Acadêmico por Bloco" por semestre, em PDF, com
curso, período e turno por bloco e sala (inclui Direito). Versão de 2026.2:
https://www.ufac.br/site/academico/calendario-academico/espaco_fisico_dos_cursos_de_graduacao___2026-2.pdf

**O que falta:** é PDF, então só daria uma tabela digitada à mão e conferida, sempre com "conforme NURCA, 2026.2", e
refeita a cada semestre. Falta decidir quem digita e confere, e como ligar a linha do PDF (curso, período, turno) à
turma do Portal sem inventar o vínculo.

## 5. Calendário acadêmico oficial da graduação

**O que é:** datas do semestre (início e fim das aulas, prazos de matrícula, trancamento, exames) no lugar do Google
Agenda do Portal, parado em 2022.

**O que já se sabe:** a fonte oficial é o PDF "Calendário Acadêmico 2026-2027 - Cursos de Graduação"
(https://www.ufac.br/site/academico/calendario-academico/calendarios-academicos-antigos/calendario-academico-2026-2027-cursos-de-graduacao.pdf),
e o NURCA já reprogramou 2026.1 uma vez
(https://www.ufac.br/site/academico/calendario-academico/calendarios-academicos-antigos/calendario-academico-2026-1_reprogramacao.pdf).

**O que falta:** é PDF, então seria uma lista de datas digitada à mão, conferida e com a fonte, sempre da versão mais
recente (as reprogramações invalidam a anterior). Sem essa conferência, não entra no app.

## 6. Editais da Proaes e da Prograd

**Já no app (21/11/2026):** Menu › Editais. Lista os editais do ano (título, data de publicação e de atualização) das
duas pró-reitorias e abre cada um no Safari. Lê direto do site da Ufac (`www3.ufac.br/<setor>/@search`, API pública do
Plone, com CORS aberto), sem o Worker e sem cookies, só ao abrir a tela ou puxar para atualizar, com cache de 6 horas.
No começo do ano, enquanto a pasta nova está vazia, mostra os do ano anterior.

**Depois:** avisar quando sair edital novo (precisaria de leitura em segundo plano: só pelo Worker, uma vez por dia);
há editais da Proaes também em `www.ufac.br/proaes`, que não entram na lista estruturada.

## Notas: "quanto preciso no exame" e CR oficial

**Já no app (21/11/2026):** ao abrir o quadro de uma disciplina do semestre atual, com as notas lançadas, média
parcial (MP) acima de 0 e abaixo de 8, exame e média final ainda em branco e faltas dentro do limite, o cartão mostra a
nota mínima no exame (EF = 10 − MP, arredondada para cima na 1ª casa), citando o Regimento Geral da Ufac (Res. CONSU
33/2011, alterada pelas 43/2011 e 50/2013), arts. 305, 316, 317, 319 e 320. O que o portal lançar (Exame e Média Final)
sempre vale mais.
A "Média das disciplinas" na folha de semestres entrou na 1.6 e foi retirada na 1.7, a pedido do Matheus.

**CR oficial (fica de fora):** o Regimento não traz "coeficiente", "CR" nem "IRA", e nenhuma resolução publicada traz a
fórmula. O CR é calculado pelo SIE e sai no relatório "Histórico Escolar CR – Aprovados". Só entra no app se um
extrator conseguir ler o valor desse relatório (é PDF) ou se a Ufac publicar a fórmula.

**Lacuna:** o Regimento não diz se a MF de quem passa direto (MP ≥ 8) é a própria MP. O app não calcula isso: mostra a
Média Final do portal.
