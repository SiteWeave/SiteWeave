# Generate Microsoft Store AppX tile assets in store-assets/appx/
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$OutDir = Join-Path $root "store-assets\appx"
$sourcesDir = Join-Path $root "store-assets\appx-sources"

$local1080 = Join-Path $sourcesDir "logo-1080.png"
$local300 = Join-Path $sourcesDir "logo-300.png"

if (Test-Path $local1080) {
  $SourceSquare = $local1080
} elseif (Test-Path $local300) {
  $SourceSquare = $local300
} else {
  $candidates = @(
    "C:\Users\Abadi\.cursor\projects\c-Users-Abadi-siteweaveapp\assets\c__Users_Abadi_AppData_Roaming_Cursor_User_workspaceStorage_acdc96a7895425fd4930bc3dd8221830_images_SiteWeaveLogoCrop__2_-e9a6c208-a184-487c-b242-57d3ffe89208.png",
    "C:\Users\Abadi\.cursor\projects\c-Users-Abadi-siteweaveapp\assets\c__Users_Abadi_AppData_Roaming_Cursor_User_workspaceStorage_acdc96a7895425fd4930bc3dd8221830_images_SiteWeaveLogoCrop__1_-800f7767-55f9-4c5d-a751-245c02032d96.png"
  )
  $SourceSquare = $null
  foreach ($c in $candidates) {
    if (Test-Path $c) { $SourceSquare = $c; break }
  }
  if (-not $SourceSquare) {
    Write-Error "No source logo found. Add logo-1080.png to store-assets/appx-sources/"
  }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Add-Type -AssemblyName System.Drawing

function Resize-Png {
  param([string]$Src, [int]$W, [int]$H, [string]$Dest)
  $srcImg = [System.Drawing.Image]::FromFile($Src)
  $bmp = $null
  try {
    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.Clear([System.Drawing.Color]::Black)
      $g.DrawImage($srcImg, 0, 0, $W, $H)
    } finally { $g.Dispose() }
    $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $srcImg.Dispose()
    if ($bmp) { $bmp.Dispose() }
  }
  Write-Host "Wrote $Dest (${W}x${H})"
}

$sizes = @{
  "StoreLogo.png" = @(50, 50)
  "Square44x44Logo.png" = @(44, 44)
  "Square150x150Logo.png" = @(150, 150)
  "LargeTile.png" = @(310, 310)
  "SmallTile.png" = @(71, 71)
}

foreach ($name in $sizes.Keys) {
  $w, $h = $sizes[$name]
  Resize-Png -Src $SourceSquare -W $w -H $h -Dest (Join-Path $OutDir $name)
}

$widePath = Join-Path $OutDir "Wide310x150Logo.png"
$srcImg = [System.Drawing.Image]::FromFile($SourceSquare)
$bmp = $null
try {
  $bmp = New-Object System.Drawing.Bitmap 310, 150
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Black)
    $pad = 12
    $availW = 310 - 2 * $pad
    $availH = 150 - 2 * $pad
    $scale = [Math]::Min($availW / $srcImg.Width, $availH / $srcImg.Height)
    $dw = [int]($srcImg.Width * $scale)
    $dh = [int]($srcImg.Height * $scale)
    $dx = [int]((310 - $dw) / 2)
    $dy = [int]((150 - $dh) / 2)
    $g.DrawImage($srcImg, $dx, $dy, $dw, $dh)
  } finally { $g.Dispose() }
  $bmp.Save($widePath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $srcImg.Dispose()
  if ($bmp) { $bmp.Dispose() }
}
Write-Host "Wrote $widePath (310x150)"
Write-Host "AppX assets ready in $OutDir"
