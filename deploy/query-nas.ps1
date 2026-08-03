# 第一步：将查询脚本写到 NAS（用 cat > file 方式，避免 bash -s 的 BOM 问题）
$bashCmd = @'
export PATH=/usr/local/bin:/usr/bin:/bin
source /volume1/docker/crm-stack/.env.secrets

echo "===== ADMIN STATUS ====="
docker exec huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm -e "SELECT id,username,real_name,must_change_password,status FROM sys_user WHERE id=1" 2>/dev/null

echo ""
echo "===== DEPARTMENTS ====="
docker exec huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm -e "SELECT id,name,parent_id FROM sys_dept WHERE deleted_at IS NULL ORDER BY id" 2>/dev/null

echo ""
echo "===== USERS ====="
docker exec huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm -e "SELECT u.id,u.username,u.real_name,r.code AS role_code,u.status FROM sys_user u LEFT JOIN sys_role r ON u.role_id=r.id WHERE u.deleted_at IS NULL ORDER BY u.id" 2>/dev/null

echo ""
echo "===== BUSINESS COUNTS ====="
docker exec huakey-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" huakey_crm -e "SELECT (SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL) AS customers, (SELECT COUNT(*) FROM crm_product WHERE deleted_at IS NULL) AS products, (SELECT COUNT(*) FROM crm_supplier WHERE deleted_at IS NULL) AS suppliers, (SELECT COUNT(*) FROM crm_opportunity WHERE deleted_at IS NULL) AS opps, (SELECT COUNT(*) FROM crm_contract WHERE deleted_at IS NULL) AS contracts" 2>/dev/null

echo ""
echo "===== DONE ====="
'@

# 移除 CRLF -> LF
$bashCmd = $bashCmd -replace "`r`n", "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$bytes = $utf8NoBom.GetBytes($bashCmd)
Write-Host "Script size: $($bytes.Length) bytes, first 3 bytes: $($bytes[0]),$($bytes[1]),$($bytes[2])"

# 写到 NAS 文件
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = '-o BatchMode=yes nas-crm "cat > /volume1/docker/crm-stack/query.sh"'
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
Write-Host "Write exit: $($process.ExitCode)"

# 第二步：执行查询脚本
Write-Host ""
Write-Host "=== Executing query ==="
$result = ssh -o BatchMode=yes nas-crm 'bash /volume1/docker/crm-stack/query.sh' 2>&1
Write-Host $result

# 清理
ssh -o BatchMode=yes nas-crm 'rm -f /volume1/docker/crm-stack/query.sh' 2>&1 | Out-Null
