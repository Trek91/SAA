Add-Type -AssemblyName System.Drawing
$assetDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\build'))
[IO.Directory]::CreateDirectory($assetDirectory) | Out-Null
$frames = @()
foreach ($size in @(16, 24, 32, 48, 64, 128, 256, 1024)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 256.0), ($size / 256.0))
    $background = [Drawing.Drawing2D.GraphicsPath]::new()
    foreach ($corner in @(@(4,4,180), @(168,4,270), @(168,168,0), @(4,168,90))) {
        $background.AddArc($corner[0], $corner[1], 84, 84, $corner[2], 90)
    }
    $background.CloseFigure()
    $brush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,21,24,27))
    $graphics.FillPath($brush, $background)
    $bubble = [Drawing.Drawing2D.GraphicsPath]::new()
    $bubble.AddBezier(80,188,94,198,110,202,128,202)
    $bubble.AddBezier(128,202,171,202,204,168,204,126)
    $bubble.AddBezier(204,126,204,84,170,50,128,50)
    $bubble.AddBezier(128,50,86,50,52,84,52,126)
    $bubble.AddBezier(52,126,52,143,57,159,67,171)
    $bubble.AddLine(67,171,54,204)
    $bubble.AddLine(54,204,80,188)
    $bubble.CloseFigure()
    $pen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(255,197,214,206), 13)
    $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($pen, $bubble)
    $dots = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,197,214,206))
    foreach ($dotX in @(94,120,146)) { $graphics.FillEllipse($dots, $dotX, 119, 13, 13) }
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    if ($size -le 256) { $frames += [PSCustomObject]@{Size=$size; Bytes=$bytes} }
    if ($size -eq 256) { [IO.File]::WriteAllBytes((Join-Path $assetDirectory 'icon.png'), $bytes) }
    if ($size -eq 1024) { [IO.File]::WriteAllBytes((Join-Path $assetDirectory 'icon-mac.png'), $bytes) }
    $stream.Dispose(); $dots.Dispose(); $pen.Dispose(); $bubble.Dispose(); $brush.Dispose(); $background.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$file = [IO.File]::Create((Join-Path $assetDirectory 'icon.ico'))
$writer = [IO.BinaryWriter]::new($file)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
        $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
} finally { $writer.Dispose(); $file.Dispose() }
