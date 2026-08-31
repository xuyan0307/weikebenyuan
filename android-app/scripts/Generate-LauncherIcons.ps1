param(
    [string]$Source = "../../public/logo.jpg",
    [string]$Resources = "../app/src/main/res"
)

Add-Type -AssemblyName System.Drawing

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $Source))
$resourcesPath = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $Resources))
$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
    # Crop the brand mark from the square source so it remains legible at launcher-icon sizes.
    $crop = [System.Drawing.RectangleF]::new(160, 45, 680, 680)
    foreach ($entry in $sizes.GetEnumerator()) {
        $directory = Join-Path $resourcesPath $entry.Key
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
        $size = [int]$entry.Value
        $bitmap = [System.Drawing.Bitmap]::new($size, $size)
        try {
            $bitmap.SetResolution(96, 96)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.Clear([System.Drawing.Color]::Transparent)

                $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
                try {
                    $path.AddEllipse(0, 0, $size, $size)
                    $graphics.SetClip($path)
                    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#EAF6FE"))
                    $padding = [Math]::Max(2, [int]($size * 0.08))
                    $destination = [System.Drawing.Rectangle]::new($padding, $padding, $size - 2 * $padding, $size - 2 * $padding)
                    $graphics.DrawImage($sourceImage, $destination, $crop.X, $crop.Y, $crop.Width, $crop.Height, [System.Drawing.GraphicsUnit]::Pixel)
                }
                finally {
                    $path.Dispose()
                }
            }
            finally {
                $graphics.Dispose()
            }
            $bitmap.Save((Join-Path $directory "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $bitmap.Dispose()
        }
    }
}
finally {
    $sourceImage.Dispose()
}
