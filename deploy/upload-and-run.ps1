# 通用：通过 SSH stdin 上传 bash 脚本到 NAS /tmp/ 并执行
# 用法：.\upload-and-run.ps1 <本地脚本路径> <远程脚本名>
param(
    [Parameter(Mandatory=$true)][string]$LocalScript,
    [Parameter(Mandatory=$true)][string]$RemoteName
)

$content = Get-Content $LocalScript -Raw
$content = $content -replace "`r`n", "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$bytes = $utf8NoBom.GetBytes($content)

# 上传到 /tmp/
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = "-o BatchMode=yes nas-crm `"cat > /tmp/$RemoteName`""
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false

$process = [System.Diagnostics.Process]::Start($psi)
$process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$process.StandardInput.Close()
$process.StandardOutput.ReadToEnd() | Out-Null
$process.StandardError.ReadToEnd() | Out-Null
$process.WaitForExit(15000)

# 执行
Write-Host "=== 执行 $RemoteName ==="
$result = ssh -o BatchMode=yes nas-crm "bash /tmp/$RemoteName" 2>&1
Write-Host $result

# 清理
ssh -o BatchMode=yes nas-crm "rm -f /tmp/$RemoteName" 2>&1 | Out-Null
