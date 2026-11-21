import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O banco é falso: o teste só confere o que seria gravado.
const gravados = {};
vi.mock('../src/lib/armazenamento.js', () => ({
  ler: async (k) => gravados[k],
  gravar: async (k, v) => { gravados[k] = v; },
  apagar: async (k) => { delete gravados[k]; },
}));

const { escolherFoto, FALHA_FOTO } = await import('../src/telas/comum.js');

/** Simula a escolha na fototeca: troca o click() do input pela entrega de um arquivo. */
function escolher(arquivo, evento = 'change') {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
    expect(document.body.contains(this)).toBe(true); // o input está no DOM quando o seletor abre
    if (arquivo) Object.defineProperty(this, 'files', { value: [arquivo], configurable: true });
    queueMicrotask(() => this.dispatchEvent(new Event(evento)));
  });
}

// O jsdom não tem Blob.arrayBuffer nem URL.createObjectURL (o Safari tem).
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((ok) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(leitor.result);
      leitor.readAsArrayBuffer(this);
    });
  };
}
URL.createObjectURL ??= () => 'blob:teste';
URL.revokeObjectURL ??= () => {};

const arquivoFalso = (bytes = 10) => new File([new Uint8Array(bytes)], 'foto.jpg', { type: 'image/jpeg' });

describe('escolherFoto', () => {
  beforeEach(() => {
    for (const k of Object.keys(gravados)) delete gravados[k];
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete HTMLImageElement.prototype.decode;
  });

  it('grava a foto reduzida quando a imagem abre', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close() {} }));
    const desenhar = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: desenhar });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((ok) => ok(new Blob(['x'], { type: 'image/jpeg' })));
    escolher(arquivoFalso());
    expect(await escolherFoto()).toBe(true);
    expect(gravados.foto.bytes.byteLength).toBeGreaterThan(0);
    expect(gravados.foto.tipo).toBe('image/jpeg');
    expect(gravados.fotoVersao).toBeTruthy();
    // Recorte central em quadrado: 600 x 600 a partir de x = 100.
    expect(desenhar.mock.calls[0].slice(1)).toEqual([100, 0, 600, 600, 0, 0, 512, 512]);
    expect(document.querySelector('input[type=file]')).toBeNull(); // sai do DOM só no fim
  });

  it('tenta pelo <img> quando o createImageBitmap recusa (HEIC)', async () => {
    vi.stubGlobal('createImageBitmap', async () => { throw new Error('formato'); });
    HTMLImageElement.prototype.decode = async () => {}; // o jsdom não tem decode()
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(400);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((ok) => ok(new Blob(['x'])));
    escolher(arquivoFalso());
    expect(await escolherFoto()).toBe(true);
    expect(gravados.foto.bytes.byteLength).toBeGreaterThan(0);
  });

  it('avisa em linguagem humana quando a foto não abre, sem gravar nada', async () => {
    vi.stubGlobal('createImageBitmap', async () => { throw new Error('formato'); });
    HTMLImageElement.prototype.decode = async () => { throw new Error('decode'); };
    escolher(arquivoFalso());
    expect(await escolherFoto()).toBe(false);
    expect(gravados.foto).toBeUndefined();
    expect(document.body.textContent).toContain(FALHA_FOTO);
  });

  it('foto vazia (iCloud ainda baixando) também avisa', async () => {
    escolher(arquivoFalso(0));
    expect(await escolherFoto()).toBe(false);
    expect(document.body.textContent).toContain(FALHA_FOTO);
  });

  it('cancelar o seletor termina sem gravar', async () => {
    escolher(null, 'cancel');
    expect(await escolherFoto()).toBe(false);
    expect(gravados.foto).toBeUndefined();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });
});
