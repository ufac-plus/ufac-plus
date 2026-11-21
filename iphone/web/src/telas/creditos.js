// Créditos: quem faz o UFAC+ e o que cada um fez. Mesmo texto da seção "Créditos" do site (index.html).
import { botaoRedondo, cabecalho, html, item, montar, notaRodape } from '../ui/componentes.js';

const PESSOAS = [
  {
    iniciais: 'AH',
    nome: 'Arthur Henrique de Souza Cavalcante Ferreira',
    papel: 'Idealizador e criador',
    texto: 'Idealizou e criou o UFAC+, desenhou as telas e desenvolve o app para Android.',
  },
  {
    iniciais: 'MB',
    nome: 'Matheus Barros Cardoso',
    papel: 'Colaborador · versão iPhone',
    texto: 'Implementou recursos do app, levou o UFAC+ inteiro para o iPhone como app da web e colabora no site.',
    ambar: true,
  },
];

export default async function creditos(tela, { voltar, acoes }) {
  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Créditos', sub: 'Quem faz o UFAC+', acoes: botaoRedondo('voltar', 'Voltar', 'voltar') })}
    ${PESSOAS.map((p) => html`<section class="cartao pessoa-credito">
      <div class="avatar ${p.ambar ? 'ambar' : ''}" aria-hidden="true">${p.iniciais}</div>
      <div class="cresce">
        <h2 class="nome-credito">${p.nome}</h2>
        <div class="papel-credito">${p.papel}</div>
        <p class="apoio texto-credito">${p.texto}</p>
      </div>
    </section>`)}
    <section class="cartao lista">
      ${item({ icone: 'globo', titulo: 'Código aberto no GitHub', sub: 'github.com/ufac-plus/ufac-plus', href: 'https://github.com/ufac-plus/ufac-plus' })}
    </section>
    ${notaRodape('App independente, feito por alunos. Não é um aplicativo oficial da Ufac.')}
  </div>`);
  acoes.voltar = voltar;
}
