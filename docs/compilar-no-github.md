# Compilar e testar o Android pelo GitHub (sem PC)

O robô `.github/workflows/android.yml` faz nos computadores do GitHub o que antes era feito no PC:

1. `flutter pub get` e `flutter test --exclude-tags visual` (Flutter 3.47.9, Java 17);
2. se os testes passarem, gera o APK.

Ele roda sozinho a cada envio (push) que mexe em `android/` no `main` ou num branch `android-…`, e em pull requests. Também dá para rodar na mão: **Actions › Android › Run workflow**.

O APK fica na página da execução, em **Artifacts**, por 14 dias. **No modo oficial**, num push ao `main` ou ao `android-paridade-iphone`, o robô também cria a Release `vX.Y.Z` como Latest (nunca Pre-release), com as notas de `docs/notas-android/vX.Y.Z.md`; se a Release já existe, não faz nada. Arthur autorizou isso em 24/11/2026. No modo teste nada é publicado.

## Os dois modos

| | Modo **teste** (sem a chave) | Modo **oficial** (com a chave nos Secrets) |
|---|---|---|
| Nome no celular | UFAC+ Teste | UFAC+ |
| Instala | **ao lado** do app oficial | **por cima** do app oficial (mantém login e dados) |
| Identificador | `…ufac_no_bolso.teste` | `io.github.ufacnobolso.ufac_no_bolso` |
| Classroom | não funciona (o Google só aceita o app oficial) | funciona |
| Arquivo | `ufac-mais-<versão>-teste.apk` (só arm64) | `ufac-mais-<versão>-oficial.apk` |

O robô escolhe sozinho: se a chave estiver cadastrada, oficial; se não, teste. No modo oficial ele confere a impressão digital da chave (SHA-1 `7D:85:…:8E:BA`) e **para com erro** se não for a de sempre, para nunca gerar um APK que não atualize por cima.

A versão de teste é a mesma que dá para gerar no PC com `UFAC_TESTE=1` (ver `android/android/app/build.gradle.kts`): outro identificador, nome "UFAC+ Teste" e chave de depuração.

## Baixar e instalar no celular

1. No celular, entre em github.com/ufac-plus/ufac-plus (logado) › **Actions** › a execução mais recente de **Android** com o sinal verde.
2. Role até **Artifacts** e toque no nome do APK. Baixa um `.zip`.
3. Abra o `.zip` no app **Arquivos** do Android, toque no `.apk` e em **Instalar**. Na primeira vez o Android pede para permitir instalar apps "desta fonte" (o navegador ou o Arquivos): permita só para isso.
4. Se o Android disser que o pacote **conflita** com um existente:
   - na cópia **de teste**: desinstale só o "UFAC+ Teste" e instale de novo (a chave de teste do robô expira se ficar 7 dias sem uso);
   - no app **oficial**: **não desinstale** (perderia login e dados). Avise no chat: é sinal de chave errada.

## Passar a gerar o app oficial (fazer uma vez, no PC que tem a chave)

Pré-requisitos: a cópia de `ufac_no_bolso.jks` e `key.properties` em `android/android/` (como sempre), e o GitHub CLI instalado e logado (`gh auth login`).

De dentro de `android/`:

```powershell
powershell -ExecutionPolicy Bypass -File tools\configurar_assinatura_github.ps1
```

O script confere que a chave é a oficial e grava, sem mostrar nada na tela, estes Secrets do repositório:

| Secret | O que é |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | o arquivo `.jks` em texto (base64) |
| `ANDROID_KEYSTORE_PASSWORD` | senha do arquivo |
| `ANDROID_KEY_ALIAS` | apelido da chave |
| `ANDROID_KEY_PASSWORD` | senha da chave (se for diferente) |
| `CONTATO_EMAIL` / `CONTATO_WHATSAPP` | contatos do "Relatar um problema", lidos do `.env.json` (opcional) |

Os Secrets ficam cifrados no GitHub: ninguém lê de volta (nem os donos), e pull requests vindos de forks não têm acesso a eles. Depois disso, toda execução gera o APK oficial. Para voltar ao modo teste, apague `ANDROID_KEYSTORE_BASE64` em **Settings › Secrets and variables › Actions**.

**Backup da chave:** os Secrets não servem de backup, porque não dá para baixar de volta. Continue guardando o `.jks` e a senha fora do repositório, como antes.

## Quando algo falha

- **Testes (vermelho no passo "Testes"):** abra o passo e copie o trecho com `[E]` ou `Expected/Actual` para o Claude.
- **"A assinatura do APK não é a chave oficial":** Secrets errados. Rode o script de novo no PC certo.
- **App travando no celular:** sem PC não há `adb logcat`. Anote a tela e o que fez antes, e use "Relatar um problema".
