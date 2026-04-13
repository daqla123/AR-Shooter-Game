# AR人脸射击游戏 - USB调试启动脚本
param([int]$Port = 8080)

$Host.UI.RawUI.BackgroundColor = "Black"
$Host.UI.RawUI.ForegroundColor = "White"
Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   AR人脸射击游戏 - USB调试启动器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$GamePath = $PSScriptRoot
if ([string]::IsNullOrEmpty($GamePath)) {
    $GamePath = Get-Location
}

# 检查Python
function Test-Python {
    try {
        $ver = python --version 2>&1
        return $ver -match "Python"
    } catch { return $false }
}

# 检查Node
function Test-Node {
    try {
        $ver = node --version 2>$null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

# 检查ADB
function Test-Adb {
    try {
        adb version >$null 2>&1
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

# 启动服务器
Write-Host "[1/4] 启动HTTP服务器..." -ForegroundColor Yellow

Push-Location $GamePath

$serverStarted = $false
if (Test-Python) {
    Write-Host "      使用Python服务器 (端口 $Port)" -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$GamePath'; python -m http.server $Port" -WindowStyle Normal
    $serverStarted = $true
}
elseif (Test-Node) {
    Write-Host "      使用Node.js服务器 (端口 $Port)" -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$GamePath'; npx serve -p $Port" -WindowStyle Normal
    $serverStarted = $true
}
else {
    Write-Host "      错误: 需要Python或Node.js" -ForegroundColor Red
    Write-Host "      请安装Python: https://python.org" -ForegroundColor Yellow
}

Pop-Location

if (-not $serverStarted) {
    Read-Host "按Enter退出"
    exit 1
}

Write-Host "      服务器已启动" -ForegroundColor Green
Start-Sleep -Seconds 2

# 设置ADB
Write-Host "[2/4] 检查ADB设备..." -ForegroundColor Yellow

if (Test-Adb) {
    $devices = adb devices 2>$null
    if ($devices -match "device\s+device") {
        Write-Host "      找到Android设备" -ForegroundColor Green
        adb reverse tcp:$Port tcp:$Port 2>$null
        Write-Host "      端口转发已设置" -ForegroundColor Green
    } else {
        Write-Host "      未检测到设备" -ForegroundColor Yellow
        Write-Host "      请检查USB连接和开发者选项" -ForegroundColor Yellow
    }
} else {
    Write-Host "      ADB未安装，跳过" -ForegroundColor Yellow
}

# 打开Chrome
Write-Host "[3/4] 打开Chrome调试页面..." -ForegroundColor Yellow

$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

$chromeFound = $false
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        Start-Process $path "chrome://inspect/#devices"
        $chromeFound = $true
        break
    }
}

if ($chromeFound) {
    Write-Host "      Chrome已打开" -ForegroundColor Green
} else {
    Write-Host "      请手动打开: chrome://inspect/#devices" -ForegroundColor Yellow
}

# 获取IP
Write-Host "[4/4] 获取访问地址..." -ForegroundColor Yellow

$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -eq "Dhcp"
} | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  手机访问地址:" -ForegroundColor White
Write-Host "     http://localhost:$Port" -ForegroundColor Cyan
if ($localIP) {
    Write-Host "     http://${localIP}:$Port" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Chrome调试:" -ForegroundColor White
Write-Host "     chrome://inspect/#devices" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "使用步骤:" -ForegroundColor White
Write-Host "  1. 确保手机USB已连接" -ForegroundColor Gray
Write-Host "  2. 手机允许USB调试" -ForegroundColor Gray
Write-Host "  3. 手机浏览器打开上述地址" -ForegroundColor Gray
Write-Host "  4. Chrome中点击'Inspect'调试" -ForegroundColor Gray
Write-Host ""
Read-Host "按Enter退出"
