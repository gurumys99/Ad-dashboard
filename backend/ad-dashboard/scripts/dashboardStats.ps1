param (
    [string]$Server,
    [string]$SearchBase,
    [string]$Domain,
    [string]$Username,
    [string]$PasswordStr
)

# Convert plain text password to secure string, create PSCredential
$SecurePassword = ConvertTo-SecureString $PasswordStr -AsPlainText -Force
$Credential = New-Object System.Management.Automation.PSCredential ("$Username", $SecurePassword)

$ErrorActionPreference = "Stop"
try {
    # 1. Total Login Today
    # Since LastLogonDate can be intensive, we'll try to get it. 
    # If the domain is large, fetching all users is slow, but assuming typical lab environment:
    $yesterday = (Get-Date).AddDays(-1)
    
    $yesterday = (Get-Date).AddDays(-1)
    
    $allUsers = Get-ADUser -Server $Server -SearchBase $SearchBase -Credential $Credential -Filter * -Properties LockedOut, lockoutTime, LastLogonDate, lastLogon, PasswordLastSet

    $totalLoginToday = @()
    $totalAccountLocked = @()
    $totalResetDoneToday = @()
    $passwordExpireIn5Days = @()
    $inactive10DaysUsers = @()

    $pwdExpiryThresholdMin = (Get-Date).AddDays(-90)
    $pwdExpiryThresholdMax = (Get-Date).AddDays(-85)
    $inactive10DaysThreshold = (Get-Date).AddDays(-10)

    foreach ($user in $allUsers) {
        $teamName = "Default"
        if ($user.DistinguishedName -match 'CN=[^,]+,(?:OU|CN)=([^,]+)') {
            $teamName = $matches[1]
        }

        # Active Directory sometimes leaves lockoutTime > 0 even after manual unlock, so we must rely on the calculated LockedOut boolean.
        if ($user.LockedOut -eq $true) {
            $lockTimeStr = ""
            try { 
                if ($user.lockoutTime -gt 0) {
                    $lockTimeStr = [datetime]::FromFileTime($user.lockoutTime).ToString('yyyy-MM-dd HH:mm:ss') 
                }
            } catch {}
            $totalAccountLocked += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $lockTimeStr }
        }
        
        # In AD, LastLogonDate takes up to 14 days to sync! lastLogon is real-time.
        $realLogin = $user.LastLogonDate
        if ($user.lastLogon -and $user.lastLogon -gt 0) {
            $dcLogon = [datetime]::FromFileTime($user.lastLogon)
            if ($null -eq $realLogin -or $dcLogon -gt $realLogin) { $realLogin = $dcLogon }
        }

        if ($realLogin -and $realLogin -ge $yesterday) {
            $totalLoginToday += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $realLogin.ToString('yyyy-MM-dd HH:mm:ss') }
        }

        if ($realLogin -and $realLogin -lt $inactive10DaysThreshold) {
            $inactive10DaysUsers += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $realLogin.ToString('yyyy-MM-dd HH:mm:ss') }
        }

        if ($user.PasswordLastSet -and $user.PasswordLastSet -ge $yesterday) {
            $totalResetDoneToday += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $user.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss') }
        }

        if ($user.PasswordLastSet -and $user.PasswordLastSet -ge $pwdExpiryThresholdMin -and $user.PasswordLastSet -le $pwdExpiryThresholdMax) {
            $passwordExpireIn5Days += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $user.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss') }
        }
    }

    $result = @{
        totalUsersFound = @($allUsers).Count
        
        totalLoginToday = @($totalLoginToday).Count
        loginTodayUsers = @($totalLoginToday)
        
        totalAccountLocked = @($totalAccountLocked).Count
        accountLockedUsers = @($totalAccountLocked)
        
        totalResetDoneToday = @($totalResetDoneToday).Count
        resetDoneTodayUsers = @($totalResetDoneToday)
        
        passwordExpireIn5Days = @($passwordExpireIn5Days).Count
        expireIn5DaysUsers = @($passwordExpireIn5Days)
        
        totalInactive10Days = @($inactive10DaysUsers).Count
        inactive10DaysUsers = @($inactive10DaysUsers)
    }
    
    # Output as JSON
    $result | ConvertTo-Json -Compress

} catch {
    $errorObj = @{
        error = $_.Exception.Message
    }
    $errorObj | ConvertTo-Json -Compress
    exit 1
}
