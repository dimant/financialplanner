# Simple static file server in PowerShell
# Usage: pwsh ./serve.ps1

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8000/')
$listener.Start()
Write-Host 'Serving HTTP on http://localhost:8000/'

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = $context.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
    $fullPath = Join-Path $PSScriptRoot $path
    if (Test-Path $fullPath) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
        switch ($ext) {
            '.html' { $context.Response.ContentType = 'text/html' }
            '.css'  { $context.Response.ContentType = 'text/css' }
            '.js'   { $context.Response.ContentType = 'application/javascript' }
            default { $context.Response.ContentType = 'application/octet-stream' }
        }
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $context.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $context.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $context.Response.Close()
}
