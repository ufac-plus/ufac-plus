// Aviso de saldo baixo do RU (issue #14). A refeição de estudante custa R$ 1,00: com R$ 2,00 ou menos, dá para
// no máximo duas refeições, e o cartão do saldo avisa para recarregar antes da próxima.
export const LIMITE_SALDO_BAIXO = 2;

/** true quando o saldo lido é um número e está no limite ou abaixo dele. Sem saldo lido, não avisa. */
export const saldoBaixo = (ru) => typeof ru?.saldo === 'number' && Number.isFinite(ru.saldo) && ru.saldo <= LIMITE_SALDO_BAIXO;
