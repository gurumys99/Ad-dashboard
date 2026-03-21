param (
    [string]$Server,
    [string]$Username,
    [string]$PasswordStr,
    [string]$TargetGroup = "Domain Admins"
)

$ErrorActionPreference = "Stop"

try {
    # 1. Test Authentication by trying to bind
    $SecurePassword = ConvertTo-SecureString $PasswordStr -AsPlainText -Force
    $Credential = New-Object System.Management.Automation.PSCredential ($Username, $SecurePassword)
    
    # We test auth by getting the user's own properties
    # Just isolating the username without the domain for standard searches if it's UPN
    $CleanUser = $Username
    if ($Username -match "^(?:[^@\\]+[\\])?([^@]+)(?:@.*)?$") {
        $CleanUser = $matches[1]
    }

    $authCheck = Get-ADUser -Identity $CleanUser -Server $Server -Credential $Credential
    
    if (-not $authCheck) {
        throw "Invalid credentials or user not found."
    }

    # 2. Check if they belong to Domain Admins
    $isAdmin = $false
    # We query the group members
    $groupMembers = Get-ADGroupMember -Identity $TargetGroup -Recursive -Server $Server -Credential $Credential
    foreach ($member in $groupMembers) {
        if ($member.sAMAccountName -eq $CleanUser) {
            $isAdmin = $true
            break
        }
    }

    $result = @{
        success = $true
        isAdmin = $isAdmin
        username = $authCheck.sAMAccountName
        displayName = $authCheck.Name
    }

    $result | ConvertTo-Json -Compress

} catch {
    $errorObj = @{
        success = $false
        error = "Authentication failed: $($_.Exception.Message)"
    }
    $errorObj | ConvertTo-Json -Compress
    exit 1
}
