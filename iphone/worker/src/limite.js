// Limite de pedidos por IP nas rotas /google/*, que gastam o client secret com o Google.
// Principal: binding de Rate Limiting da Cloudflare (LIMITE_GOOGLE em wrangler.toml, sem custo extra).
// Reserva: se o binding faltar ou falhar, um contador em memória por isolado. É só melhor-esforço:
// cada isolado da Cloudflare tem o seu, e ele zera quando o isolado é reciclado.

export const LIMITE_POR_MINUTO = 30; // mesmo número do wrangler.toml; folga para Wi-Fi da Ufac com muita gente no mesmo IP
const JANELA_MS = 60_000;
const MAX_IPS = 5000; // não deixa a memória crescer sem fim

const contadores = new Map(); // ip → { inicio, n }

export function limiteEmMemoria(ip, agora = Date.now()) {
  const atual = contadores.get(ip);
  if (!atual || agora - atual.inicio >= JANELA_MS) {
    if (contadores.size >= MAX_IPS) {
      for (const [chave, c] of contadores) if (agora - c.inicio >= JANELA_MS) contadores.delete(chave);
      if (contadores.size >= MAX_IPS) contadores.clear();
    }
    contadores.set(ip, { inicio: agora, n: 1 });
    return true;
  }
  atual.n += 1;
  return atual.n <= LIMITE_POR_MINUTO;
}

/** Só para os testes. */
export function zerarLimiteEmMemoria() {
  contadores.clear();
}

/** true = pode seguir. O IP só é usado como chave do contador; não é guardado nem registrado. */
export async function dentroDoLimite(pedido, env) {
  const ip = pedido.headers.get('CF-Connecting-IP') ?? 'sem-ip';
  if (env.LIMITE_GOOGLE?.limit) {
    try {
      const { success } = await env.LIMITE_GOOGLE.limit({ key: ip });
      return success;
    } catch {
      // binding fora do ar: cai no contador em memória em vez de liberar tudo
    }
  }
  return limiteEmMemoria(ip);
}

export function respostaMuitosPedidos() {
  return Response.json(
    { erro: 'muitos_pedidos', mensagem: 'Muitos pedidos seguidos ao Google. Espere um minuto e tente de novo.' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );
}
