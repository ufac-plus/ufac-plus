// Refeições e cardápio. Porte de lib/config.dart, lib/data/refeicoes.dart e cardapio.dart.
import { mesmoDia } from './formatos.js';

// Horários do post do RU de 04/11/2026.
export const REFEICOES = [
  { id: 'cafe', nome: 'Café', minusculo: 'café', inicioMin: 6 * 60 + 30, fimMin: 8 * 60 },
  { id: 'almoco', nome: 'Almoço', minusculo: 'almoço', inicioMin: 11 * 60, fimMin: 14 * 60 },
  { id: 'jantar', nome: 'Jantar', minusculo: 'jantar', inicioMin: 18 * 60, fimMin: 19 * 60 + 30 },
];

export const refeicaoPorId = (id) => REFEICOES.find((r) => r.id === id);

/**
 * A refeição em andamento ou a próxima. Depois do jantar, é o café de amanhã:
 * vem com `amanha: true` (quem só usa .id/.nome continua funcionando), para ninguém mostrar o café de hoje, que já passou.
 */
export function proximaRefeicao(agora) {
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const hoje = REFEICOES.find((r) => minutos < r.fimMin);
  return hoje ? { ...hoje, amanha: false } : { ...REFEICOES[0], amanha: true };
}

const SAUDACAO = /^(bo[am]\s+(café|cafe|almoço|almoco|jantar|janta|apetite|refeição|refeicao)|tenham?\s+um)/i;

/** "SALADA: Alface" vira "Salada: Alface". O rótulo é do próprio eTICKET, não inventado. */
function rotuloLegivel(linha) {
  const m = /^([A-ZÀ-Ý ]{3,}):\s*(.*)$/.exec(linha);
  if (!m) return linha;
  const r = m[1].trim().toLowerCase();
  return `${r[0].toUpperCase()}${r.slice(1)}: ${m[2]}`;
}

/**
 * Separa o texto do eTICKET em itens. Aceita os dois formatos já vistos:
 * uma frase com vírgulas ("Café preto, Leite, Pão.") e uma linha por item ("-Arroz\nSALADA: Alface\nBom almoço <3").
 * Saudações e enfeites saem. "Não informado" vira lista vazia.
 */
export function itensDoCardapio(texto) {
  const limpo = (texto ?? '').trim();
  const baixo = limpo.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[.!\s]+$/, '');
  if (!limpo || baixo === 'nao informado' || baixo === 'indisponivel') return [];
  const linhas = limpo
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-–—•*·]+/, '').replace(/\s*(<3|❤️?|♥)+\s*$/u, '').trim())
    .filter((l) => l && !SAUDACAO.test(l));
  return linhas.flatMap((l) => {
    const semPonto = l.replace(/[.;]$/, '');
    if (/^[A-ZÀ-Ý ]{3,}:/.test(semPonto)) return [rotuloLegivel(semPonto)];
    return semPonto
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);
  });
}

/** Cardápio lido num dia: { lidoEm (ISO), textos: { cafe, almoco, jantar } }. A página não tem data. */
export const cardapioValeEm = (c, agora) => !!c && mesmoDia(new Date(c.lidoEm), agora);

const assinatura = (texto) => itensDoCardapio(texto).join('|').toLowerCase();

/**
 * De manhã cedo o eTICKET ainda pode mostrar o texto de ontem. A refeição fica em dúvida quando o texto é igual ao
 * último lido num dia anterior (`c.anterior`) e foi lido antes de ela começar. Lido depois do início, vale (o RU
 * repete pratos, sobretudo no café, e a essa altura o eTICKET já publicou).
 */
export function refeicaoRepetida(c, id) {
  const r = refeicaoPorId(id);
  if (!c?.anterior || !r) return false;
  const lido = new Date(c.lidoEm);
  if (mesmoDia(new Date(c.anterior.lidoEm), lido)) return false;
  const atual = assinatura(c.textos?.[id]);
  if (!atual || atual !== assinatura(c.anterior.textos?.[id])) return false;
  return lido.getHours() * 60 + lido.getMinutes() < r.inicioMin;
}

export const AVISO_REPETIDO = 'Igual ao de ontem; o eTICKET pode ainda não ter atualizado.';

/** Vale ler de novo se não há cardápio de hoje, se falta alguma refeição ou se alguma ainda pode ser a de ontem. */
export const cardapioPendente = (c, agora) =>
  !cardapioValeEm(c, agora) ||
  REFEICOES.some((r) => itensDoCardapio(c.textos[r.id]).length === 0 || refeicaoRepetida(c, r.id));
