$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

Write-Host ''
Write-Host 'NEX Browser Agent Updater' -ForegroundColor Cyan
Write-Host 'Selecione a pasta que ja esta carregada em chrome://extensions.' -ForegroundColor Gray
Write-Host ''

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Selecione a pasta local da extensao NEX Browser Agent'
$dialog.ShowNewFolderButton = $false
$result = $dialog.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($dialog.SelectedPath)) {
  Write-Host 'Atualizacao cancelada.' -ForegroundColor Yellow
  return
}

$destination = [System.IO.Path]::GetFullPath($dialog.SelectedPath)
$manifestPath = Join-Path $destination 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'A pasta selecionada nao contem manifest.json. Nada foi alterado.'
}
$existing = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($existing.name -notlike '*NEX*Agente*' -and $existing.name -notlike '*NEX*Browser*') {
  throw 'O manifest.json nao parece ser da extensao NEX. Nada foi alterado.'
}

$tempRoot = Join-Path $env:TEMP ('nex-extension-update-' + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $tempRoot 'source.zip'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
  $archiveUrl = 'https://github.com/araujxs22-crypto/nex-ai/archive/refs/heads/feat/nex-browser-agent.zip'
  Write-Host 'Baixando apenas para a pasta temporaria do Windows...' -ForegroundColor Gray
  Invoke-WebRequest -Uri $archiveUrl -OutFile $archive -UseBasicParsing

  $extractPath = Join-Path $tempRoot 'extract'
  Expand-Archive -LiteralPath $archive -DestinationPath $extractPath -Force
  $repoFolder = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
  if (-not $repoFolder) { throw 'Nao foi possivel abrir o pacote do NEX.' }

  $source = Join-Path $repoFolder.FullName 'extension\sala-do-futuro'
  $sourceManifestPath = Join-Path $source 'manifest.json'
  if (-not (Test-Path -LiteralPath $sourceManifestPath -PathType Leaf)) {
    throw 'A versao nova da extensao nao foi encontrada.'
  }

  $updatedManifest = Get-Content -LiteralPath $sourceManifestPath -Raw | ConvertFrom-Json
  if ($updatedManifest.name -ne 'NEX — Agente de Navegador' -or $updatedManifest.version -ne '1.5.0') {
    throw 'A versao ou identificacao do pacote nao corresponde a NEX 1.5.0.'
  }

  Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
  Write-Host ''
  Write-Host ('Extensao atualizada para NEX ' + $updatedManifest.version + '.') -ForegroundColor Green
  Write-Host 'Agora abra chrome://extensions e clique em Atualizar nesta extensao.' -ForegroundColor Cyan
  Write-Host 'Mantenha a pasta selecionada carregada como extensao sem compactacao.' -ForegroundColor Gray
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
