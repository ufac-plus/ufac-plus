# Cadastra a chave de assinatura do app OFICIAL nos Secrets do GitHub,
# para o robô (.github/workflows/android.yml) gerar o APK que instala por cima.
#
# Rode UMA vez, no PC que tem a chave, de dentro da pasta android/:
#   powershell -ExecutionPolicy Bypass -File tools\configurar_assinatura_github.ps1
#
# Precisa do GitHub CLI logado (gh auth login). Nenhuma senha aparece na tela:
# os valores vão direto do key.properties para o cofre do GitHub (criptografados).
# Guia: docs/compilar-no-github.md

$ErrorActionPreference = 'Stop'
$repo = 'ufac-plus/ufac-plus'

function Enviar-Secret($nome, $valor) {
    if ([string]::IsNullOrEmpty($valor)) { return }
    $valor | gh secret set $nome --repo $repo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Não consegui gravar $nome no GitHub." }
    Write-Host "  ok: $nome"
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'O GitHub CLI (gh) não está instalado. Instale em https://cli.github.com e rode "gh auth login".'
}
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'O gh não está logado. Rode "gh auth login" e tente de novo.' }

$arqProps = Join-Path $PSScriptRoot '..\android\key.properties'
if (-not (Test-Path $arqProps)) { throw "Não achei $arqProps. Coloque ali a cópia do key.properties." }

$props = @{}
foreach ($linha in Get-Content $arqProps) {
    if ($linha -match '^\s*([^#=]+?)\s*=\s*(.*)$') { $props[$Matches[1]] = $Matches[2] }
}
foreach ($k in 'storeFile', 'storePassword', 'keyAlias') {
    if (-not $props[$k]) { throw "O key.properties não tem '$k'." }
}

# storeFile pode ser relativo à pasta android/android/app (regra do Gradle)
$jks = $props['storeFile']
if (-not [System.IO.Path]::IsPathRooted($jks)) {
    $jks = Join-Path (Join-Path $PSScriptRoot '..\android\app') $jks
}
if (-not (Test-Path $jks)) { throw "Não achei a chave em $jks (caminho do storeFile)." }

# Confere que é a chave oficial antes de mandar (SHA-1 pública, do CLAUDE.md)
$sha1Oficial = '7D:85:A3:3B:3D:30:45:02:4A:20:CD:0A:81:53:EC:F1:CD:60:8E:BA'
if (Get-Command keytool -ErrorAction SilentlyContinue) {
    $env:UFAC_SENHA_TMP = $props['storePassword']
    $saida = keytool -list -v -keystore $jks -alias $props['keyAlias'] -storepass:env UFAC_SENHA_TMP 2>$null
    Remove-Item Env:UFAC_SENHA_TMP
    if (-not ($saida -match [regex]::Escape($sha1Oficial))) {
        throw 'Essa chave NÃO é a oficial (SHA-1 diferente). Nada foi enviado.'
    }
    Write-Host 'Chave oficial conferida (SHA-1).'
} else {
    Write-Host 'Aviso: keytool não encontrado; o robô vai conferir a SHA-1 na primeira compilação.'
}

Write-Host "Gravando os Secrets em $repo ..."
Enviar-Secret 'ANDROID_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($jks)))
Enviar-Secret 'ANDROID_KEYSTORE_PASSWORD' $props['storePassword']
Enviar-Secret 'ANDROID_KEY_ALIAS' $props['keyAlias']
Enviar-Secret 'ANDROID_KEY_PASSWORD' $props['keyPassword']

# Contatos do "Relatar um problema", se houver .env.json
$arqEnv = Join-Path $PSScriptRoot '..\.env.json'
if (Test-Path $arqEnv) {
    $env = Get-Content $arqEnv -Raw | ConvertFrom-Json
    Enviar-Secret 'CONTATO_EMAIL' $env.CONTATO_EMAIL
    Enviar-Secret 'CONTATO_WHATSAPP' $env.CONTATO_WHATSAPP
}

Write-Host ''
Write-Host 'Pronto. Daqui para a frente o robô gera o APK OFICIAL, que instala por cima.'
Write-Host 'Para testar agora: GitHub > Actions > Android > Run workflow.'
