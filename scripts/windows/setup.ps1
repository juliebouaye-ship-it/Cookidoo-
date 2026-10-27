# Installation du serveur Cookidoo MCP sur Windows (une seule fois).
#
# Lancement, depuis le dossier du repo :
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
#
# Ce que fait le script :
#   1. vérifie Node.js
#   2. demande l'email et le mot de passe Cookidoo (saisis ici, jamais affichés)
#      et génère le token d'accès, puis écrit le fichier .env
#   3. installe les dépendances et compile le serveur
#   4. branche Claude Desktop sur le serveur (sauvegarde de la config existante)
#   5. crée un raccourci « Cookidoo (menus) » sur le Bureau
#
# Options :
#   -Reset       ressaisir les identifiants et régénérer le token
#   -ConfigOnly  ne refaire que le branchement de Claude Desktop (sans réinstaller)

param([switch]$Reset, [switch]$ConfigOnly)

$ErrorActionPreference = 'Stop'
$MCP_REMOTE_VERSION = '0.14.3'
$PNPM_VERSION = '11.28.4'
$PORT = 3000

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$EnvFile = Join-Path $RepoRoot '.env'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "    OK  $text" -ForegroundColor Green }
function Fail($text) { Write-Host "`n[ERREUR] $text" -ForegroundColor Red; exit 1 }

function Read-EnvValue($name) {
  if (-not (Test-Path $EnvFile)) { return $null }
  foreach ($line in [System.IO.File]::ReadAllLines($EnvFile)) {
    if ($line -match "^\s*$name=(.*)$") {
      $v = $Matches[1].Trim()
      if ($v.Length -ge 2 -and "'`"``".IndexOf($v[0]) -ge 0 -and $v[0] -eq $v[$v.Length - 1]) {
        $v = $v.Substring(1, $v.Length - 2)
      }
      return $v
    }
  }
  return $null
}

# Met une valeur entre les guillemets qu'elle ne contient pas (format dotenv).
function Quote-EnvValue($value) {
  foreach ($q in @("'", '"', '`')) {
    if (-not $value.Contains($q)) { return "$q$value$q" }
  }
  Fail "Le mot de passe contient à la fois ' et `" et ``, ce que le fichier .env ne sait pas stocker."
}

function New-Token {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

# ---------------------------------------------------------------------------
Write-Step 'Vérification de Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Fail "Node.js est introuvable. Installe-le avec :`n    winget install OpenJS.NodeJS.LTS`nPuis ferme et rouvre PowerShell, et relance ce script."
}
$nodeVersion = (& node -v).Trim()
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 22) {
  Fail "Node.js $nodeVersion est trop ancien (il faut la version 22 ou plus). Mets-le à jour avec :`n    winget upgrade OpenJS.NodeJS.LTS"
}
Write-Ok "Node.js $nodeVersion"

# ---------------------------------------------------------------------------
Write-Step 'Configuration (.env)'
$token = Read-EnvValue 'MCP_AUTH_TOKEN'
if ((Test-Path $EnvFile) -and $token -and -not $Reset) {
  Write-Ok '.env déjà présent : je le garde (relance avec -Reset pour le refaire).'
} else {
  $email = Read-Host '    Email du compte Cookidoo'
  if (-not $email.Trim()) { Fail 'Email vide.' }
  $secure = Read-Host '    Mot de passe Cookidoo (rien ne s''affiche, c''est normal)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $password) { Fail 'Mot de passe vide.' }

  $token = New-Token
  $lines = @(
    '# Généré par scripts\windows\setup.ps1 - NE JAMAIS COMMITER CE FICHIER',
    "COOKIDOO_EMAIL=$($email.Trim())",
    "COOKIDOO_PASSWORD=$(Quote-EnvValue $password)",
    "MCP_AUTH_TOKEN=$token",
    '# Mettre HOST=0.0.0.0 pour y accéder depuis un autre ordi de la maison',
    'HOST=127.0.0.1',
    "PORT=$PORT",
    'COOKIDOO_COUNTRY_CODE=fr',
    'COOKIDOO_LANGUAGE=fr-FR',
    'COOKIDOO_URL=https://cookidoo.fr/foundation/fr-FR',
    'COOKIDOO_COOKIE_FILE=./data/.cookidoo-session.json',
    'CALENDAR_CACHE_FILE=./data/calendar-history.json',
    'LOG_LEVEL=info'
  )
  [System.IO.File]::WriteAllText($EnvFile, ($lines -join "`r`n") + "`r`n", $Utf8NoBom)
  $password = $null
  Write-Ok '.env écrit (identifiants + token).'
}
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'data') | Out-Null

# ---------------------------------------------------------------------------
if (-not $ConfigOnly) {
Write-Step 'Installation des dépendances et compilation (quelques minutes la première fois)'
Push-Location $RepoRoot
try {
  $env:HUSKY = '0'
  & npx --yes "pnpm@$PNPM_VERSION" install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { Fail 'pnpm install a échoué.' }
  & npx --yes "pnpm@$PNPM_VERSION" run build
  if ($LASTEXITCODE -ne 0) { Fail 'La compilation a échoué.' }
} finally { Pop-Location }
Write-Ok 'Serveur compilé (dist\main.js).'
}

# ---------------------------------------------------------------------------
Write-Step 'Branchement de Claude Desktop'
# Claude Desktop réécrit sa config en quittant : s'il est ouvert pendant la
# modification, il efface le bloc « cookidoo ». Il doit donc être fermé.
while (Get-Process -Name 'Claude' -ErrorAction SilentlyContinue) {
  Write-Host '    Claude Desktop est ouvert. Quitte-le complètement :' -ForegroundColor Yellow
  Write-Host '    icône près de l''horloge > clic droit > Quitter (ou Gestionnaire des tâches > Claude > Fin de tâche).' -ForegroundColor Yellow
  Read-Host '    Puis appuie sur Entrée pour continuer' | Out-Null
}
$configDirs = @(Join-Path $env:APPDATA 'Claude')
# Version Microsoft Store de Claude : config dans un dossier virtualisé.
Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue |
  ForEach-Object {
    $d = Join-Path $_.FullName 'LocalCache\Roaming\Claude'
    if (Test-Path $d) { $configDirs += $d }
  }

$serverEntry = [ordered]@{
  command = 'cmd'
  args    = @('/c', 'npx', '-y', "mcp-remote@$MCP_REMOTE_VERSION",
              "http://127.0.0.1:$PORT/api/mcp", '--allow-http',
              '--header', 'Authorization:${AUTH_HEADER}')
  env     = [ordered]@{ AUTH_HEADER = "Bearer $token" }
}

foreach ($dir in $configDirs) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $cfgPath = Join-Path $dir 'claude_desktop_config.json'
  $cfg = $null
  if (Test-Path $cfgPath) {
    $backup = "$cfgPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $cfgPath $backup
    $raw = [System.IO.File]::ReadAllText($cfgPath)
    if ($raw.Trim()) {
      try { $cfg = $raw | ConvertFrom-Json }
      catch { Fail "La config Claude existante n'est pas du JSON valide : $cfgPath (sauvegarde : $backup)" }
    }
  }
  if (-not $cfg) { $cfg = New-Object PSObject }
  if (-not ($cfg.PSObject.Properties.Name -contains 'mcpServers')) {
    $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue (New-Object PSObject)
  }
  if ($cfg.mcpServers.PSObject.Properties.Name -contains 'cookidoo') {
    $cfg.mcpServers.cookidoo = $serverEntry
  } else {
    $cfg.mcpServers | Add-Member -NotePropertyName cookidoo -NotePropertyValue $serverEntry
  }
  [System.IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json -Depth 20), $Utf8NoBom)
  Write-Ok "Serveur « cookidoo » ajouté à $cfgPath"
}

# ---------------------------------------------------------------------------
Write-Step 'Raccourci sur le Bureau'
try {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Cookidoo (menus).lnk'))
  $lnk.TargetPath = Join-Path $PSScriptRoot 'start-cookidoo.cmd'
  $lnk.WorkingDirectory = $RepoRoot
  $lnk.Description = 'Démarre le serveur Cookidoo pour Claude'
  $lnk.Save()
  Write-Ok 'Raccourci « Cookidoo (menus) » créé.'
} catch {
  Write-Host "    (raccourci non créé : lance scripts\windows\start-cookidoo.cmd à la place)" -ForegroundColor Yellow
}

Write-Host "`nC'est prêt !" -ForegroundColor Green
Write-Host '  1. Double-clique sur « Cookidoo (menus) » sur le Bureau (laisse la fenêtre ouverte).'
Write-Host '  2. Ouvre Claude Desktop : « cookidoo » apparaît dans Paramètres > Développeur.'
Write-Host '  3. Dans Claude : « Lis notre historique Cookidoo et propose-nous les dîners de la semaine ».'
