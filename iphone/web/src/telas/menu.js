import { ler } from '../lib/armazenamento.js';
import { oficial, URL_PORTAL_ALUNO, URL_PORTAL_PROFESSOR } from '../lib/config.js';
import { abreFora, botaoRedondo, cabecalho, html, ic, montar, notaRodape } from '../ui/componentes.js';
import { confirmarSaida } from './comum.js';

// Mapa oficial do campus (NTI da Ufac): blocos, setores e horários de cada prédio, informados pela própria Ufac.
const URL_MAPA_CAMPUS = 'https://sistemas.ufac.br/mapa/';

const atalho = (icone, nome, href) =>
  href ? html`<a class="cartao tocavel atalho" href="${href}" target="_blank" rel="noopener"><span class="item" style="padding:0;min-height:0"><span class="icone">${ic(icone)}</span></span><span class="forte">${nome}</span>${abreFora}</a>` : '';

export default async function menu(tela, { voltar, ir, perfil, acoes }) {
  const id = await ler('idInterno');
  const comunicacoes = await ler('urlComunicacoes');
  const professor = perfil === 'professor';
  montar(tela, html`<div class="pilha entra">
    ${cabecalho({ titulo: 'Menu', acoes: botaoRedondo('fechar', 'Fechar', 'voltar') })}
    ${!professor ? html`<button class="cartao item tocavel" data-acao="biblioteca"><span class="icone">${ic('livro')}</span><span class="cresce"><span class="titulo">Biblioteca</span><span class="apoio sub">Pesquisar no acervo</span></span><span class="seta">${ic('seta')}</span></button>` : ''}
    ${!professor ? html`<button class="cartao item tocavel" data-acao="editais"><span class="icone">${ic('megafone')}</span><span class="cresce"><span class="titulo">Editais</span><span class="apoio sub">Proaes, Prograd e Proex · horas complementares</span></span><span class="seta">${ic('seta')}</span></button>` : ''}
    <a class="cartao item tocavel" href="${URL_MAPA_CAMPUS}" target="_blank" rel="noopener"><span class="icone">${ic('globo')}</span><span class="cresce"><span class="titulo">Mapa do campus</span><span class="apoio sub">Blocos e setores · site oficial da Ufac</span></span><span class="seta">${ic('abrir')}</span>${abreFora}</a>
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
  acoes.editais = () => ir('editais');
  acoes.sair = () => confirmarSaida(ir);
}
