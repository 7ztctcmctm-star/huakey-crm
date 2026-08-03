# 更新 NAS admin 密码 + 设置 must_change_password=1
# 通过 SSH stdin 管道传 SQL，避免 $ 符号被 shell 解释

$sql = "UPDATE sys_user SET password='$2b$10$0DuKGZH041BMKPhW4eql6.VK8a.x.qeekoiQV47GrB3VTPfKuzRK2', must_change_password=1 WHERE id=1;`nSELECT id,username,must_change_password,status FROM sys_user WHERE id=1;`n"

# 用无 BOM UTF-8 编码
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$bytes = $utf8NoBom.GetBytes($sql)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = '-o BatchMode=yes nas-crm "export PATH=/usr/local/bin:/usr/bin:/bin; source /volume1/docker/crm-stack/.env.secrets; docker exec -i huakey-mysql mysql -uroot -p`$MYSQL_ROOT_PASSWORD huakey_crm"'
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

if ($stderr -and $stderr -notmatch "Warning.*password") { Write-Host "STDERR: $stderr" }
Write-Host $stdout
