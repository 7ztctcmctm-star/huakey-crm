# 通过 SSH stdin 上传备份脚本到 NAS
$scriptContent = Get-Content "c:\huakey-crm\deploy\nas-backup.sh" -Raw
$scriptContent = $scriptContent -replace "`r`n", "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$bytes = $utf8NoBom.GetBytes($scriptContent)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = '-o BatchMode=yes nas-crm "cat > /tmp/backup.sh && sudo mv /tmp/backup.sh /volume1/docker/crm-stack/backup.sh && sudo chmod +x /volume1/docker/crm-stack/backup.sh && echo OK"'
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false

$process = [System.Diagnostics.Process]::Start($psi)
$process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$process.StandardInput.Close()
$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit(20000)

Write-Host "STDOUT: $stdout"
if ($stderr) { Write-Host "STDERR: $stderr" }
Write-Host "Exit: $($process.ExitCode)"
