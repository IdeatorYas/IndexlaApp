<#
.SYNOPSIS
  Zero-loss WIP checkpoint: commit + push a recovery branch, then return to the
  original branch with local changes restored (never discards work).

.DESCRIPTION
  Creates checkpoint/<yyyy-mm-dd>-<topic>, stages intentional project files,
  blocks secrets/build/temp paths, creates a WIP commit, pushes to origin,
  checks out the original branch, and restores the WIP as local changes via
  cherry-pick -n (no commit on the original branch).

  Never runs reset --hard, clean, or force-push.

.PARAMETER Topic
  Short kebab-case topic (letters, numbers, hyphens). Used in the branch name.

.PARAMETER AllowEmpty
  Allow creating/pushing a checkpoint commit with no file changes (marker only).

.EXAMPLE
  .\scripts\checkpoint.ps1 -Topic "design-freeze-pass2"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
  [string]$Topic,

  [switch]$AllowEmpty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host "[checkpoint] $Message"
}

function Write-Err([string]$Message) {
  Write-Host "[checkpoint:ERROR] $Message" -ForegroundColor Red
}

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) {
    throw "Not inside a git repository."
  }
  return $root.Trim()
}

function Test-IsBlockedPath([string]$Path) {
  $n = ($Path -replace "\\", "/").TrimStart("./")
  $lower = $n.ToLowerInvariant()

  # Secrets / env (allow .env.example only)
  if ($lower -eq ".env.example") { return $false }
  if ($lower -match '(^|/)\.env($|\.)') { return $true }
  if ($lower -match '(^|/)(\.env\.local)$') { return $true }
  if ($lower -match 'secret|credential|credentials\.json') { return $true }
  if ($lower -match '\.(pem|key|p12|pfx|jks)$') { return $true }
  if ($lower -match '(^|/)id_rsa|(^|/)id_ed25519|(^|/)private[_-]?key') { return $true }

  # Build / deps / tooling caches
  if ($lower -match '(^|/)node_modules(/|$)') { return $true }
  if ($lower -match '(^|/)\.next(/|$)') { return $true }
  if ($lower -match '(^|/)(out|build|coverage)(/|$)') { return $true }
  if ($lower -match '(^|/)(test-results|playwright-report|blob-report|\.playwright)(/|$)') { return $true }
  if ($lower -match '(^|/)\.deploy-builds(/|$)') { return $true }
  if ($lower -match '(^|/)\.next-good(/|$)') { return $true }
  if ($lower -match '\.tsbuildinfo$') { return $true }

  # Temp / local artifacts
  if ($lower -match '(^|/)tmp(/|$)') { return $true }
  if ($lower -match 'dashboard-screenshots') { return $true }
  if ($lower -match '\.(log|tgz|tar\.gz)$') { return $true }

  return $false
}

function Test-FileLooksLikeSecret([string]$FullPath) {
  if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) { return $false }
  $item = Get-Item -LiteralPath $FullPath -ErrorAction SilentlyContinue
  if ($null -eq $item -or $item.Length -gt 512KB) { return $false }

  try {
    $text = Get-Content -LiteralPath $FullPath -Raw -ErrorAction Stop
  } catch {
    return $false
  }

  if ($text -match '(?im)^(AWS_SECRET_ACCESS_KEY|PRIVATE_KEY|SECRET_KEY|API_KEY|COINGECKO_API_KEY)\s*=') {
    return $true
  }
  if ($text -match '(?im)BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY') {
    return $true
  }
  if ($text -match '(?i)sk_live_[A-Za-z0-9]+') {
    return $true
  }
  return $false
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$remoteUrl = (git remote get-url origin 2>$null)
if ($remoteUrl -notmatch 'IndexlaApp') {
  throw "Refusing to run: origin does not look like IndexlaApp (got: $remoteUrl). Never use this on the website repo."
}

$origBranch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($origBranch)) {
  throw "Detached HEAD is not supported. Checkout a branch first."
}

$startSha = (git rev-parse HEAD).Trim()
$date = Get-Date -Format "yyyy-MM-dd"
$branchName = "checkpoint/$date-$Topic"

Write-Info "repo=$repoRoot"
Write-Info "origin=$remoteUrl"
Write-Info "workingBranch=$origBranch @ $($startSha.Substring(0,7))"
Write-Info "checkpointBranch=$branchName"

# Ensure branch name is free locally; if it exists, refuse (no overwrite)
git rev-parse --verify --quiet "refs/heads/$branchName" | Out-Null
if ($LASTEXITCODE -eq 0) {
  throw "Local branch $branchName already exists. Choose another -Topic or delete it only with founder approval."
}

git fetch origin --quiet 2>$null
git ls-remote --exit-code --heads origin $branchName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  throw "Remote branch $branchName already exists. Choose another -Topic."
}

git checkout -b $branchName
if ($LASTEXITCODE -ne 0) { throw "Failed to create $branchName" }

# Collect candidate paths from status (respects .gitignore via porcelain)
$statusLines = git status --porcelain -u --untracked-files=all
$toAdd = New-Object System.Collections.Generic.List[string]
$blocked = New-Object System.Collections.Generic.List[string]

foreach ($line in $statusLines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  # porcelain: XY PATH or XY ORIG -> PATH for renames
  $pathPart = $line.Substring(3)
  if ($pathPart -match ' -> ') {
    $pathPart = ($pathPart -split ' -> ', 2)[1]
  }
  $pathPart = $pathPart.Trim().Trim('"')

  if (Test-IsBlockedPath $pathPart) {
    [void]$blocked.Add($pathPart)
    continue
  }

  $full = Join-Path $repoRoot $pathPart
  if (Test-FileLooksLikeSecret $full) {
    [void]$blocked.Add("$pathPart (content looks like a secret)")
    continue
  }

  [void]$toAdd.Add($pathPart)
}

if ($blocked.Count -gt 0) {
  Write-Info "Blocked (not staged):"
  $blocked | ForEach-Object { Write-Host "  - $_" }
}

$committed = $false
$checkpointSha = $startSha

if ($toAdd.Count -eq 0) {
  if (-not $AllowEmpty) {
    Write-Err "Nothing safe to stage. Working tree has no eligible changes (or all changes were blocked)."
    git checkout $origBranch
    if ($LASTEXITCODE -ne 0) { throw "Failed to return to $origBranch after empty checkpoint." }
    throw "Checkpoint aborted (no eligible files). Re-run with -AllowEmpty only if you intentionally want an empty marker commit."
  }

  git commit --allow-empty -m @"
WIP checkpoint (empty): $Topic

Recovery marker only. No eligible file changes were present.
Branch: $branchName
"@
  if ($LASTEXITCODE -ne 0) { throw "Empty commit failed." }
  $committed = $true
} else {
  Write-Info "Staging $($toAdd.Count) path(s)..."
  foreach ($p in $toAdd) {
    git add -- $p
    if ($LASTEXITCODE -ne 0) {
      throw "git add failed for $p"
    }
  }

  # Final safety: refuse if any blocked path ended up staged
  $staged = git diff --cached --name-only
  foreach ($s in $staged) {
    if (Test-IsBlockedPath $s) {
      git restore --staged -- $s 2>$null
      throw "Refusing to commit blocked staged path: $s"
    }
    $full = Join-Path $repoRoot $s
    if (Test-FileLooksLikeSecret $full) {
      git restore --staged -- $s 2>$null
      throw "Refusing to commit suspected secret: $s"
    }
  }

  $stagedCheck = @(git diff --cached --name-only)
  if ($stagedCheck.Count -eq 0) {
    git checkout $origBranch
    throw "Nothing left staged after safety filters."
  }

  $fileList = ($stagedCheck | ForEach-Object { "  - $_" }) -join "`n"
  git commit -m @"
WIP checkpoint: $Topic

Zero-loss recovery snapshot. Not for production deploy by itself.
Branch: $branchName
Files:
$fileList
"@
  if ($LASTEXITCODE -ne 0) { throw "Commit failed." }
  $committed = $true
}

$checkpointSha = (git rev-parse HEAD).Trim()
Write-Info "commit=$($checkpointSha.Substring(0,7))"

git push -u origin "HEAD:refs/heads/$branchName"
if ($LASTEXITCODE -ne 0) {
  throw "Push failed. Checkpoint commit exists locally on $branchName @ $($checkpointSha.Substring(0,7)). Fix remotes and push manually — do not discard."
}

Write-Info "Pushed origin/$branchName"

# Return to original branch without discarding WIP
git checkout $origBranch
if ($LASTEXITCODE -ne 0) {
  throw "Push succeeded but failed to checkout $origBranch. Stay on $branchName and recover manually — do not reset."
}

if ($committed -and $checkpointSha -ne $startSha) {
  # Restore WIP as local (uncommitted) changes on the original branch
  git cherry-pick -n $checkpointSha
  if ($LASTEXITCODE -ne 0) {
    Write-Err "cherry-pick -n failed while restoring WIP onto $origBranch."
    Write-Err "Recovery commit is safe on origin/$branchName @ $($checkpointSha.Substring(0,7))."
    throw "Manual restore: git cherry-pick -n $checkpointSha"
  }
  # Unstage so the original branch stays uncommitted WIP
  git reset HEAD --quiet
  Write-Info "Restored WIP as local changes on $origBranch (uncommitted)."
}

Write-Host ""
Write-Host "=== CHECKPOINT OK ===" -ForegroundColor Green
Write-Host "workingBranch=$origBranch"
Write-Host "checkpointBranch=$branchName"
Write-Host "checkpointCommit=$checkpointSha"
Write-Host "remote=origin/$branchName (pushed)"
Write-Host "mainTip=$(git rev-parse origin/main 2>$null)"
Write-Host "workingTree=$(if (git status --porcelain) { 'dirty' } else { 'clean' })"
