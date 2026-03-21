param (
    [string]$Server,
    [string]$SearchBase,
    [string]$Username,
    [string]$PasswordStr,
    [string]$ReportType,    # "login", "reset", or "expire"
    [string]$FromDate,      # "yyyy-MM-dd" (login/reset)
    [string]$ToDate,        # "yyyy-MM-dd" (login/reset)
    [int]$ExpireDays = 5,   # 0=Today, 5, or 10
    [int]$InactiveDays = 0, # 5, 10, or 30
    [string]$Team = ""      # Filter by OU/team name; empty = all teams
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
    # Parse date range for login/reset reports
    $fromDt = $null
    $toDt   = $null
    if ($FromDate -and $ToDate) {
        $fromDt = [datetime]::ParseExact($FromDate, "yyyy-MM-dd", $null)
        $toDt   = [datetime]::ParseExact($ToDate, "yyyy-MM-dd", $null).AddDays(1).AddSeconds(-1)
    }

    # Fetch all users with required properties
    $allUsers = Get-ADUser -Server $Server -SearchBase $SearchBase -Credential $Credential `
        -Filter * `
        -Properties LockedOut, lockoutTime, LastLogonDate, lastLogon, PasswordLastSet, `
                    PasswordNeverExpires, 'msDS-UserPasswordExpiryTimeComputed', DisplayName, Department, mail

    $results = @()

    foreach ($user in $allUsers) {
        # Extract team/OU name from Distinguished Name
        $teamName = "Default"
        if ($user.DistinguishedName -match 'CN=[^,]+,(?:OU|CN)=([^,]+)') {
            $teamName = $matches[1]
        }

        # ── Team filter ──────────────────────────────────────────────────────────
        if ($Team -and $Team -ne "" -and $Team -ne "All") {
            if ($teamName -ne $Team) { continue }
        }

        switch ($ReportType.ToLower()) {

            "login" {
                $realLogin = $user.LastLogonDate
                if ($user.lastLogon -and $user.lastLogon -gt 0) {
                    $dcLogon = [datetime]::FromFileTime($user.lastLogon)
                    if ($null -eq $realLogin -or $dcLogon -gt $realLogin) { $realLogin = $dcLogon }
                }
                if ($realLogin -and $fromDt -and $toDt) {
                    if ($realLogin -ge $fromDt -and $realLogin -le $toDt) {
                        $results += [PSCustomObject]@{
                            Username    = $user.SamAccountName
                            DisplayName = $user.Name
                            Team        = $teamName
                            TimeDone    = $realLogin.ToString('yyyy-MM-dd HH:mm:ss')
                            Detail      = "Last Login"
                        }
                    }
                }
            }

            "inactive" {
                if ($InactiveDays -gt 0) {
                    $inactiveThreshold = (Get-Date).AddDays(-$InactiveDays)
                    $realLogin = $user.LastLogonDate
                    if ($user.lastLogon -and $user.lastLogon -gt 0) {
                        $dcLogon = [datetime]::FromFileTime($user.lastLogon)
                        if ($null -eq $realLogin -or $dcLogon -gt $realLogin) { $realLogin = $dcLogon }
                    }
                    if ($realLogin -and $realLogin -lt $inactiveThreshold) {
                        $daysInactive = [math]::Floor(((Get-Date) - $realLogin).TotalDays)
                        $results += [PSCustomObject]@{
                            Username    = $user.SamAccountName
                            DisplayName = $user.Name
                            Team        = $teamName
                            TimeDone    = $realLogin.ToString('yyyy-MM-dd HH:mm:ss')
                            Detail      = "Inactive ($daysInactive days)"
                        }
                    }
                }
            }

            "reset" {
                if ($user.PasswordLastSet -and $fromDt -and $toDt) {
                    if ($user.PasswordLastSet -ge $fromDt -and $user.PasswordLastSet -le $toDt) {
                        $results += [PSCustomObject]@{
                            Username    = $user.SamAccountName
                            DisplayName = $user.Name
                            Team        = $teamName
                            TimeDone    = $user.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss')
                            Detail      = "Password Reset"
                        }
                    }
                }
            }

            "expire" {
                if ($user.PasswordNeverExpires -eq $true) { continue }

                $expiryDt = $null
                try {
                    $expiryFileTime = $user.'msDS-UserPasswordExpiryTimeComputed'
                    if ($expiryFileTime -and $expiryFileTime -gt 0) {
                        $expiryDt = [datetime]::FromFileTime($expiryFileTime)
                    }
                } catch {}

                # Fallback: PasswordLastSet + 90 days
                if ($null -eq $expiryDt -and $user.PasswordLastSet) {
                    $expiryDt = $user.PasswordLastSet.AddDays(90)
                }

                if ($expiryDt) {
                    $now = Get-Date
                    $daysUntilExpiry = ($expiryDt - $now).TotalDays

                    $matched = $false
                    if ($ExpireDays -eq 0) {
                        # "Today" — expires within the next 24 hours
                        $matched = ($daysUntilExpiry -ge 0 -and $daysUntilExpiry -lt 1)
                    } else {
                        # "Next N days"
                        $matched = ($daysUntilExpiry -ge 0 -and $daysUntilExpiry -le $ExpireDays)
                    }

                    if ($matched) {
                        $hoursLeft = [math]::Round($daysUntilExpiry * 24, 1)
                        $detailStr = if ($ExpireDays -eq 0) {
                            "Expires today (~${hoursLeft}h left)"
                        } else {
                            "Expires in $([math]::Ceiling($daysUntilExpiry)) day(s)"
                        }

                        $results += [PSCustomObject]@{
                            Username    = $user.SamAccountName
                            DisplayName = $user.Name
                            Team        = $teamName
                            TimeDone    = $expiryDt.ToString('yyyy-MM-dd HH:mm:ss')
                            Detail      = $detailStr
                        }
                    }
                }
            }
        }
    }

    @{
        count   = @($results).Count
        records = @($results)
    } | ConvertTo-Json -Depth 5 -Compress

} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
