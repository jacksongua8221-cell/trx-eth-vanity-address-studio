param(
  [string]$Repo = "trx-eth-vanity-address-studio",
  [ValidateSet("public", "private")]
  [string]$Visibility = "public",
  [string]$Tag = "v0.1.0"
)

$ErrorActionPreference = "Stop"

gh auth status | Out-Null

$Owner = gh api user --jq ".login"
$FullName = "$Owner/$Repo"
$ZipPath = Join-Path $PSScriptRoot "..\release\TRX_ETH_靓号地址生成器_便携版.zip"
$NotesPath = Join-Path $PSScriptRoot "..\docs\RELEASE_NOTES.md"

if (!(Test-Path $ZipPath)) {
  throw "Portable package not found: $ZipPath"
}

git status --short

gh repo view $FullName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gh repo create $Repo "--$Visibility" --description "Offline TRX / ETH vanity address generator desktop tool." --source "." --remote "origin"
} else {
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$FullName.git"
}

git push -u origin main

gh release view $Tag --repo $FullName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gh release create $Tag $ZipPath --repo $FullName --title "TRX / ETH Vanity Address Studio $Tag" --notes-file $NotesPath
} else {
  gh release upload $Tag $ZipPath --repo $FullName --clobber
}

Write-Host "Published: https://github.com/$FullName"
