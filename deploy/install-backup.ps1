# 上传备份脚本到 NAS 并安装 + 测试执行
# 用 [IO.File]::ReadAllText 读取文件避免 BOM

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$content = [IO.File]::ReadAllText("c:\huakey-crm\deploy\nas-backup.sh", $utf8NoBom)
$content = $content -replace "`r`n", "`n"
$bytes = $utf8NoBom.GetBytes($content)

Write-Host "Script size: $($bytes.Length) bytes"
Write-Host "First 3 bytes: $($bytes[0]),$($bytes[1]),$($bytes[2]) (should be 35,33,47 = #!/)"

# 上传到 /volume1/docker/crm-stack/backup.sh
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = '-o BatchMode=yes nas-crm "cat > /volume1/docker/crm-stack/backup.sh"'
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false

$process = [System.Diagnostics.Process]::Start($psi)
$process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$process.StandardInput.Close()
$process.StandardOutput.ReadToEnd() | Out-Null
$err = $process.StandardError.ReadToEnd()
$process.WaitForExit(15000)
Write-Host "Upload exit: $($process.ExitCode) $err"

# 设置执行权限
Write-Host ""
Write-Host "=== 设置权限 ==="
ssh -o BatchMode=yes nas-crm 'chmod +x /volume1/docker/crm-stack/backup.sh && ls -la /volume1/docker/crm-stack/backup.sh' 2>&1

# 测试执行备份脚本
Write-Host ""
Write-Host "=== 测试备份 ==="
ssh -o BatchMode=yes nas-crm 'bash /volume1/docker/crm-stack/backup.sh' 2>&1
