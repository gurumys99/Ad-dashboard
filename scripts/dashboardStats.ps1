param (
    [string]$Server,
    [string]$SearchBase,
    [string]$Domain,
    [string]$Username,
    [string]$PasswordStr,
    [string]$FromDate, # "yyyy-MM-dd"
    [string]$ToDate    # "yyyy-MM-dd"
)

# Convert plain text password to secure string, create PSCredential
$SecurePassword = ConvertTo-SecureString $PasswordStr -AsPlainText -Force
$Credential = New-Object System.Management.Automation.PSCredential ("$Username", $SecurePassword)

$ErrorActionPreference = "Stop"

# Check for AD Module
if (-not (Get-Module -ListAvailable ActiveDirectory)) {
    @{ success = $false; error = "The 'ActiveDirectory' PowerShell module is not installed. Please install RSAT for Active Directory on the server." } | ConvertTo-Json -Compress
    exit 1
}

try {
    # Parse date range
    $startDt = $null
    $endDt = $null
    if ($FromDate -and $ToDate) {
        $startDt = [datetime]::ParseExact($FromDate, "yyyy-MM-dd", $null)
        $endDt = [datetime]::ParseExact($ToDate, "yyyy-MM-dd", $null).AddDays(1).AddSeconds(-1)
    } else {
        # Default to last 24h if no range provided
        $startDt = (Get-Date).AddDays(-1)
        $endDt = Get-Date
    }
    
    $allUsers = Get-ADUser -Server $Server -SearchBase $SearchBase -Credential $Credential -Filter * -Properties LockedOut, lockoutTime, LastLogonDate, lastLogon, PasswordLastSet
    

    $loginTrendData = @{}
    $lockTrendData = @{}
    # Initialize trend data for each day in range
    $curr = $startDt.Date
    while ($curr -le $endDt.Date) {
        $dateKey = $curr.ToString("yyyy-MM-dd")
        $loginTrendData[$dateKey] = 0
        $lockTrendData[$dateKey]  = 0
        $curr = $curr.AddDays(1)
    }

    $inRangeLogins = @()
    $inRangeAccountLocked = @()
    $inRangeResetDone = @()
    
    $loginsByTeam = @{}
    $locksByTeam = @{}
    $resetsByTeam = @{}
    $statusCounts = @{ Active = 0; Disabled = 0; Locked = 0 }

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
        
        # Account Status Tracking
        if ($user.Enabled -eq $false) { $statusCounts.Disabled++ }
        elseif ($user.LockedOut -eq $true) { $statusCounts.Locked++ }
        else { $statusCounts.Active++ }

        # 1. Accounts Locked (Active check)
        if ($user.LockedOut -eq $true) {
            $lockTimeStr = ""
            $lockDt = $null
            try { 
                if ($user.lockoutTime -gt 0) {
                    $lockDt = [datetime]::FromFileTime($user.lockoutTime)
                    $lockTimeStr = $lockDt.ToString('yyyy-MM-dd HH:mm:ss') 
                }
            } catch {}
            
            # If a range is provided, only count if locked in that range
            if ($null -eq $startDt -or ($lockDt -ge $startDt -and $lockDt -le $endDt)) {
                $inRangeAccountLocked += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $lockTimeStr }
                
                # Distribution
                $locksByTeam[$teamName]++
                
                # Trend
                if ($lockDt) {
                    $lDateStr = $lockDt.ToString("yyyy-MM-dd")
                    if ($lockTrendData.ContainsKey($lDateStr)) { $lockTrendData[$lDateStr]++ }
                }
            }
        }
        
        # 2. Logins in range
        $realLogin = $user.LastLogonDate
        if ($user.lastLogon -and $user.lastLogon -gt 0) {
            $dcLogon = [datetime]::FromFileTime($user.lastLogon)
            if ($null -eq $realLogin -or $dcLogon -gt $realLogin) { $realLogin = $dcLogon }
        }

        if ($realLogin -and $realLogin -ge $startDt -and $realLogin -le $endDt) {
            $inRangeLogins += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $realLogin.ToString('yyyy-MM-dd HH:mm:ss') }
            
            # Distribution
            $loginsByTeam[$teamName]++

            # Add to trend data
            $dateStr = $realLogin.ToString("yyyy-MM-dd")
            if ($loginTrendData.ContainsKey($dateStr)) {
                $loginTrendData[$dateStr]++
            }
        }

        # 3. Resets in range
        if ($user.PasswordLastSet -and $user.PasswordLastSet -ge $startDt -and $user.PasswordLastSet -le $endDt) {
            $inRangeResetDone += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $user.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss') }
            $resetsByTeam[$teamName]++
        }

        # 4. Inactive check
        if ($realLogin -and $realLogin -lt $inactive10DaysThreshold) {
            $inactive10DaysUsers += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $realLogin.ToString('yyyy-MM-dd HH:mm:ss') }
        }

        # 5. Expiry in 5 days
        if ($user.PasswordLastSet -and $user.PasswordLastSet -ge $pwdExpiryThresholdMin -and $user.PasswordLastSet -le $pwdExpiryThresholdMax) {
            $passwordExpireIn5Days += @{ Team = $teamName; Username = $user.sAMAccountName; DisplayName = $user.Name; TimeDone = $user.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss') }
        }
    }

    # Format distributions for charts
    $loginByTeamArr = @(); foreach($k in $loginsByTeam.Keys){ $loginByTeamArr += @{ team = $k; count = $loginsByTeam[$k] } }
    $locksByTeamArr = @(); foreach($k in $locksByTeam.Keys){ $locksByTeamArr += @{ team = $k; count = $locksByTeam[$k] } }
    $resetsByTeamArr = @(); foreach($k in $resetsByTeam.Keys){ $resetsByTeamArr += @{ team = $k; count = $resetsByTeam[$k] } }
    $statusArr = @(
        @{ name = "Active";   value = $statusCounts.Active; fill = "#22c55e" },
        @{ name = "Disabled"; value = $statusCounts.Disabled; fill = "#64748b" },
        @{ name = "Locked";   value = $statusCounts.Locked; fill = "#ef4444" }
    )

    # Recharts trend array
    $trendArray = @()
    foreach ($key in ($loginTrendData.Keys | Sort-Object)) {
        $trendArray += @{ 
            date = $key; 
            logins = $loginTrendData[$key]; 
            locks = $lockTrendData[$key] 
        }
    }

    $result = @{
        totalUsersFound = @($allUsers).Count
        
        totalLoginRange = @($inRangeLogins).Count
        loginRangeUsers = @($inRangeLogins)
        
        totalAccountLockedRange = @($inRangeAccountLocked).Count
        accountLockedRangeUsers = @($inRangeAccountLocked)
        
        totalResetDoneRange = @($inRangeResetDone).Count
        resetDoneRangeUsers = @($inRangeResetDone)
        
        passwordExpireIn5Days = @($passwordExpireIn5Days).Count
        expireIn5DaysUsers = @($passwordExpireIn5Days)
        
        totalInactive10Days = @($inactive10DaysUsers).Count
        inactive10DaysUsers = @($inactive10DaysUsers)

        # New Chart Data
        loginTrend = $trendArray
        distribution = @{
            logins = $loginByTeamArr | Sort-Object -Property count -Descending
            locks  = $locksByTeamArr | Sort-Object -Property count -Descending
            resets = $resetsByTeamArr | Sort-Object -Property count -Descending
            status = $statusArr
        }
    }
    
    $result | ConvertTo-Json -Compress -Depth 10

} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
