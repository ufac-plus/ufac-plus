import { ler } from '../lib/armazenamento.js';
import { oficial, URL_PORTAL_ALUNO, URL_PORTAL_PROFESSOR } from '../lib/config.js';
import { abreFora, botaoRedondo, cabecalho, html, ic, montar, notaRodape } from '../ui/componentes.js';
import { confirmarSaida } from './comum.js';

const atalho = (icone, nome, href) =>
  href ? html`<a class="cartao tocavel atalho" href="${href}" target="_blank" rel="noopener"><span class="item" style="padding:0;min-height:0"><span class="icone">${ic(icone)}</span></span><span class="forte">${nome}</span>${abreFora}</a>` : '';

export default async function menu(tela, { voltar, ir, perfil, acoes }) {
  const id = await ler('idInterno');
  const comunicacoes = await ler('urlComunicacoes');
  const professor = perfil === 'professor';
  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Menu', acoes: botaoRedondo('fechar', 'Fechar', 'voltar') })}
    ${!professor ? html`<button class="cartao item tocavel" data-acao="biblioteca"><span class="icone">${ic('livro')}</span><span class="cresce"><span class="titulo">Biblioteca</span><span class="apoio sub">Pesquisar no acervo</span></span><span class="seta">${ic('seta')}</span></button>` : ''}
    <div class="apoio">${professor ? 'Portal do Professor' : 'Portal do Aluno'} · abre no Safari</div>
    <div class="grade-2">
      ${!professor && id ? atalho('calendario', 'Matrícula', oficial.matricula(id)) : ''}
      ${comunicacoes ? atalho('megafone', 'Comunicações', comunicacoes) : ''}
      ${atalho('globo', 'Abrir site completo', professor ? URL_PORTAL_PROFESSOR : URL_PORTAL_ALUNO)}
    </div>
    ${notaRodape('No Safari, a Ufac pede o login de novo: a sessão do app fica só dentro do app.')}
    <button class="cartao item tocavel" data-acao="config"><span class="icone">${ic('engrenagem')}</span><span class="cresce titulo">Configurações</span><span class="seta">${ic('seta')}</span></button>
    <button class="botao perigo largo tocavel" data-acao="sair">${ic('sair')} Sair da conta</button>
  </div>`);
  acoes.voltar = voltar;
  acoes.config = () => ir('configuracoes');
  acoes.biblioteca = () => ir('biblioteca');
  acoes.sair = () => confirmarSaida(ir);
}
