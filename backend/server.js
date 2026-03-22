const express = require('express');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');

console.log("Starting server...");

const app = express();
app.use(express.json());
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001'], credentials: true }));

app.use(session({
    secret: 'secret123',
    resave: false,
    saveUninitialized: false
}));

app.get('/', (req, res) => { res.send('Server is working'); });

const runPSScript = (scriptName, callback) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const serverIP = (process.env.AD_URL || '').replace('ldap://', '').replace(/:\d+$/, '');

    // Construct command with arguments
    const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -Server "${serverIP}" -SearchBase "${process.env.AD_BASE_DN}" -Username "${process.env.AD_USERNAME}" -PasswordStr "${process.env.AD_PASSWORD}"`;

    exec(command, (err, stdout, stderr) => {
        try {
            // If stdout exists and looks like JSON, parse it to extract proper PS error or success data
            if (stdout && stdout.trim().startsWith('{')) {
                const data = JSON.parse(stdout.trim());
                if (data.error) return callback(new Error(data.error));
                return callback(null, data);
            }
        } catch (parseErr) {
            console.error("JSON Parse failed for output:", stdout);
        }

        // If we made it here, stdout wasn't JSON or it failed parsing.
        if (err || stderr) {
            console.error(`PS Execution Error in ${scriptName}:`, err || stderr);
            return callback(err || new Error(stderr));
        }

        return callback(new Error("Unknown error executing PowerShell"));
    });
};

// API ROUTE for Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    console.log(`Authenticating user: ${username}...`);
    const scriptPath = path.join(__dirname, '..', 'scripts', 'authenticateUser.ps1');
    const serverIP = (process.env.AD_URL || '').replace('ldap://', '').replace(/:\d+$/, '');

    // IMPORTANT: Make sure to properly escape credentials in a real prod environment
    const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -Server "${serverIP}" -Username "${username}" -PasswordStr "${password}"`;

    exec(command, (err, stdout, stderr) => {
        try {
            if (stdout && stdout.trim().startsWith('{')) {
                const data = JSON.parse(stdout.trim());
                if (data.success && data.isAdmin) {
                    req.session.isAuthenticated = true;
                    req.session.isAdmin = true;
                    req.session.username = data.username;
                    return res.json({ success: true, message: 'Logged in successfully', user: data.displayName });
                } else if (data.success && !data.isAdmin) {
                    return res.status(403).json({ error: 'You are not a Domain Admin.' });
                }
                return res.status(401).json({ error: data.error || 'Authentication failed.' });
            }
        } catch (e) {
            console.error('Parse error during login:', stdout);
        }
        res.status(500).json({ error: 'Server authentication execution failed.' });
    });
});

// API ROUTE for Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully' });
});

// API ROUTE for Dashboard calculations
app.get('/api/dashboard', (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized access.' });

    console.log(`Fetching dashboard stats for ${req.session.username} via PowerShell...`);
    runPSScript('dashboardStats.ps1', (err, data) => {
        if (err) {
            console.error('Failed to run stats script', err);
            return res.status(500).json({ error: 'Failed to fetch dashboard AD statistics.' });
        }
        res.json(data);
    });
});

// API ROUTE for fetching Teams/OUs
app.get('/api/teams', (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized access.' });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'getTeams.ps1');
    const serverIP = (process.env.AD_URL || '').replace('ldap://', '').replace(/:\d+$/, '');

    const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" `
        + `-Server "${serverIP}" `
        + `-SearchBase "${process.env.AD_BASE_DN}" `
        + `-Username "${process.env.AD_USERNAME}" `
        + `-PasswordStr "${process.env.AD_PASSWORD}"`;

    exec(command, (err, stdout, stderr) => {
        try {
            if (stdout && stdout.trim().startsWith('{')) {
                const data = JSON.parse(stdout.trim());
                if (data.error) return res.status(500).json({ error: data.error });
                return res.json(data);
            }
        } catch (e) { console.error('Teams parse error:', stdout); }
        res.status(500).json({ error: 'Failed to fetch teams.' });
    });
});

// API ROUTE for Custom Reports
app.post('/api/custom-report', (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized access.' });

    const { fromDate, toDate, reportType, expireDays, inactiveDays } = req.body;
    if (!reportType) return res.status(400).json({ error: 'reportType is required.' });
    if ((reportType === 'login' || reportType === 'reset') && (!fromDate || !toDate)) {
        return res.status(400).json({ error: 'fromDate and toDate are required for this report type.' });
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'customReport.ps1');
    const serverIP = (process.env.AD_URL || '').replace('ldap://', '').replace(/:\d+$/, '');
    const days = expireDays ? parseInt(expireDays) : 5;
    const inactDays = inactiveDays ? parseInt(inactiveDays) : 0;

    const team = req.body.team || '';

    const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" `
        + `-Server "${serverIP}" `
        + `-SearchBase "${process.env.AD_BASE_DN}" `
        + `-Username "${process.env.AD_USERNAME}" `
        + `-PasswordStr "${process.env.AD_PASSWORD}" `
        + `-ReportType "${reportType}" `
        + `-FromDate "${fromDate || ''}" `
        + `-ToDate "${toDate || ''}" `
        + `-ExpireDays ${days} `
        + `-InactiveDays ${inactDays} `
        + `-Team "${team}"`;

    console.log(`Running custom report [${reportType}] for ${req.session.username}...`);

    exec(command, (err, stdout, stderr) => {
        try {
            if (stdout && stdout.trim().startsWith('{')) {
                const data = JSON.parse(stdout.trim());
                if (data.error) return res.status(500).json({ error: data.error });
                return res.json(data);
            }
        } catch (parseErr) {
            console.error('Custom report parse error:', stdout);
        }
        if (err || stderr) {
            console.error('Custom report execution error:', err || stderr);
            return res.status(500).json({ error: 'Failed to generate custom report.' });
        }
        return res.status(500).json({ error: 'Unknown error generating report.' });
    });
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});