param (
    [string]$Server,
    [string]$SearchBase,
    [string]$Username,
    [string]$PasswordStr
)

$SecurePassword = ConvertTo-SecureString $PasswordStr -AsPlainText -Force
$Credential = New-Object System.Management.Automation.PSCredential ("$Username", $SecurePassword)

$ErrorActionPreference = "Stop"

# Check for AD Module
if (-not (Get-Module -ListAvailable ActiveDirectory)) {
    @{ success = $false; error = "The 'ActiveDirectory' PowerShell module is not installed. Please install RSAT for Active Directory on the server." } | ConvertTo-Json -Compress
    exit 1
}

try {
    $allUsers = Get-ADUser -Server $Server -SearchBase $SearchBase -Credential $Credential `
        -Filter * -Properties DistinguishedName

    $teams = @{}
    foreach ($user in $allUsers) {
        $teamName = "Default"
        if ($user.DistinguishedName -match 'CN=[^,]+,(?:OU|CN)=([^,]+)') {
            $teamName = $matches[1]
        }
        $teams[$teamName] = $true
    }

    $teamList = @($teams.Keys | Sort-Object)
    @{ teams = $teamList } | ConvertTo-Json -Depth 3 -Compress

} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
