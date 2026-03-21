import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './Dashboard.css';

// ── CSV Export Helper ─────────────────────────────────────────────────────────
function exportToCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')
    )
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── TODAY's date string for default values ────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  // ── Overview tab state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedListTitle, setSelectedListTitle] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // ── Custom Reports tab state ────────────────────────────────────────────────
  const [reportType, setReportType] = useState('login');
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [expireDays, setExpireDays] = useState('5');
  const [inactiveDays, setInactiveDays] = useState('10');
  const [selectedTeam, setSelectedTeam] = useState('All');
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportResults, setReportResults] = useState(null);
  const [reportError, setReportError] = useState('');

  // ── Fetch overview dashboard data ───────────────────────────────────────────
  const fetchDashboardData = useCallback(() => {
    setLoading(true);
    axios.get('http://localhost:5000/api/dashboard', { withCredentials: true })
      .then(res => {
        setData(res.data);
        setLoading(false);
        if (selectedListTitle) {
          if (selectedListTitle === 'TOTAL LOGIN TODAY')      setSelectedUsers(res.data.loginTodayUsers || []);
          if (selectedListTitle === 'TOTAL ACCOUNT LOCKED')   setSelectedUsers(res.data.accountLockedUsers || []);
          if (selectedListTitle === 'TOTAL RESET DONE TODAY') setSelectedUsers(res.data.resetDoneTodayUsers || []);
          if (selectedListTitle === 'PASSWORD EXPIRE IN 5 DAYS') setSelectedUsers(res.data.expireIn5DaysUsers || []);
          if (selectedListTitle === 'INACTIVE 10 DAYS') setSelectedUsers(res.data.inactive10DaysUsers || []);
        }
      })
      .catch(err => {
        setLoading(false);
        if (err.response && err.response.status === 401) {
          alert('Session expired or unauthorized. Please log in again.');
          onLogout();
        }
      });
  }, [selectedListTitle, onLogout]);

  useEffect(() => { fetchDashboardData(); }, []); // eslint-disable-line

  // ── Fetch Team list when switching to reports tab ───────────────────────────
  const fetchTeams = useCallback(() => {
    if (teams.length > 0) return; // already loaded
    setTeamsLoading(true);
    axios.get('http://localhost:5000/api/teams', { withCredentials: true })
      .then(res => {
        setTeams(res.data.teams || []);
        setTeamsLoading(false);
      })
      .catch(() => setTeamsLoading(false));
  }, [teams]);

  const handleLogoutClick = () => {
    axios.post('http://localhost:5000/api/logout', {}, { withCredentials: true })
      .finally(() => onLogout());
  };

  const showList = (title, usersList) => {
    if (selectedListTitle && selectedListTitle !== title) {
      setIsAnimatingOut(true);
      setTimeout(() => {
        setSelectedListTitle(title);
        setSelectedUsers(usersList || []);
        setIsAnimatingOut(false);
      }, 300);
    } else {
      setSelectedListTitle(title);
      setSelectedUsers(usersList || []);
    }
  };

  const closeList = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setSelectedListTitle('');
      setSelectedUsers([]);
      setIsAnimatingOut(false);
    }, 300);
  };

  // ── Generate custom report ──────────────────────────────────────────────────
  const generateReport = () => {
    setReportLoading(true);
    setReportResults(null);
    setReportError('');

    const payload = { reportType, expireDays, team: selectedTeam };
    if (reportType === 'inactive') payload.inactiveDays = inactiveDays;
    
    if (['login', 'reset'].includes(reportType)) {
      payload.fromDate = fromDate;
      payload.toDate   = toDate;
    }

    axios.post('http://localhost:5000/api/custom-report', payload, { withCredentials: true })
      .then(res => {
        setReportResults(res.data);
        setReportLoading(false);
      })
      .catch(err => {
        setReportLoading(false);
        const msg = err.response?.data?.error || 'Failed to generate report.';
        setReportError(msg);
      });
  };

  const reportTypeLabel = {
    login:  'Login Data',
    reset:  'Password Reset',
    expire: 'Password Expiry',
    inactive: 'Inactive Users',
  };

  const csvFilename = () => {
    const base = reportTypeLabel[reportType] || 'Report';
    if (reportType === 'expire') return `${base}_Expire${expireDays}Days_${todayStr()}.csv`;
    if (reportType === 'inactive') return `${base}_Inactive${inactiveDays}Days_${todayStr()}.csv`;
    return `${base}_${fromDate}_to_${toDate}.csv`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-container">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="dashboard-header">
        <div>
          <h1>Active Directory Tracker</h1>
          <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Welcome, <strong>{user}</strong>! (Domain Admin)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'overview' && (
            <button className={`refresh-btn ${loading ? 'loading' : ''}`} onClick={fetchDashboardData} disabled={loading}>
              {loading ? 'Syncing...' : '↻ Refresh Data'}
            </button>
          )}
          <button className="refresh-btn" style={{ backgroundColor: '#ef4444' }} onClick={handleLogoutClick}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => { setActiveTab('reports'); fetchTeams(); }}
        >
          📋 Custom Reports
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          <div className="metrics-grid">
            <div className="metric-card green" onClick={() => showList('TOTAL LOGIN TODAY', data.loginTodayUsers)}>
              <div className="metric-title">Logins Today</div>
              <div className="metric-value">{data.totalLoginToday || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>

            <div className="metric-card locked" onClick={() => showList('TOTAL ACCOUNT LOCKED', data.accountLockedUsers)}>
              <div className="metric-title">Accounts Locked</div>
              <div className="metric-value">{data.totalAccountLocked || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>

            <div className="metric-card resets" onClick={() => showList('TOTAL RESET DONE TODAY', data.resetDoneTodayUsers)}>
              <div className="metric-title">Resets Done Today</div>
              <div className="metric-value">{data.totalResetDoneToday || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>

            <div className="metric-card warning" onClick={() => showList('PASSWORD EXPIRE IN 5 DAYS', data.expireIn5DaysUsers)}>
              <div className="metric-title">Expiring in 5 Days</div>
              <div className="metric-value">{data.passwordExpireIn5Days || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>

            <div className="metric-card inactive" onClick={() => showList('INACTIVE 10 DAYS', data.inactive10DaysUsers)}>
              <div className="metric-title">Inactive 10 Days</div>
              <div className="metric-value">{data.totalInactive10Days || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>
          </div>

          {selectedListTitle && (
            <div className={`list-container ${isAnimatingOut ? 'fade-out' : 'fade-in'}`}>
              <div className="list-header">
                <h3>{selectedListTitle}</h3>
                <button className="close-btn" onClick={closeList}>×</button>
              </div>
              {selectedUsers.length > 0 ? (
                <div className="table-responsive">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Display Name</th>
                        <th>Team</th>
                        <th>System Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUsers.map((u, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{u.Username || 'Unknown'}</td>
                          <td>{u.DisplayName || 'N/A'}</td>
                          <td><span className="team-badge">{u.Team || 'Default'}</span></td>
                          <td className="time-col">{u.TimeDone || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state"><p>✨ No users found matching this criteria.</p></div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CUSTOM REPORTS TAB                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div className="report-panel fade-in">

          {/* Filter Card */}
          <div className="report-filter-card">
            <h3 className="report-filter-title">🔍 Report Configuration</h3>

            {/* Report Type */}
            <div className="filter-row">
              <div className="filter-group">
                <label className="filter-label">Report Type</label>
                <div className="report-type-selector">
                  {[
                    { key: 'login',  icon: '🔐', label: 'Login Data' },
                    { key: 'reset',  icon: '🔑', label: 'Password Reset' },
                    { key: 'expire', icon: '⏰', label: 'Password Expiry' },
                    { key: 'inactive', icon: '💤', label: 'Inactive Users' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      className={`type-chip ${reportType === opt.key ? 'active' : ''}`}
                      onClick={() => { setReportType(opt.key); setReportResults(null); setReportError(''); }}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Date Range  (login & reset only) */}
            {['login', 'reset'].includes(reportType) && (
              <div className="filter-row">
                <div className="filter-group">
                  <label className="filter-label">From Date</label>
                  <input
                    type="date"
                    className="filter-input"
                    value={fromDate}
                    max={toDate}
                    onChange={e => setFromDate(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label className="filter-label">To Date</label>
                  <input
                    type="date"
                    className="filter-input"
                    value={toDate}
                    min={fromDate}
                    onChange={e => setToDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Expiry Days Dropdown (expire only) */}
            {reportType === 'expire' && (
              <div className="filter-row">
                <div className="filter-group">
                  <label className="filter-label">Password Expires</label>
                  <select
                    className="filter-input filter-select"
                    value={expireDays}
                    onChange={e => setExpireDays(e.target.value)}
                  >
                    <option value="0">Today Only</option>
                    <option value="5">Next 5 Days</option>
                    <option value="10">Next 10 Days</option>
                  </select>
                </div>
              </div>
            )}

            {/* Inactive Days Dropdown (inactive only) */}
            {reportType === 'inactive' && (
              <div className="filter-row">
                <div className="filter-group">
                  <label className="filter-label">Inactive Duration</label>
                  <select
                    className="filter-input filter-select"
                    value={inactiveDays}
                    onChange={e => setInactiveDays(e.target.value)}
                  >
                    <option value="5">Last 5 Days</option>
                    <option value="10">Last 10 Days</option>
                    <option value="30">Last 30 Days</option>
                  </select>
                </div>
              </div>
            )}

            {/* Team / OU Filter */}
            <div className="filter-row">
              <div className="filter-group">
                <label className="filter-label">Team / OU</label>
                <select
                  className="filter-input filter-select"
                  value={selectedTeam}
                  onChange={e => setSelectedTeam(e.target.value)}
                  disabled={teamsLoading}
                >
                  <option value="All">All Teams</option>
                  {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Generate Button */}
            <div className="filter-actions">
              <button
                className={`generate-btn ${reportLoading ? 'loading' : ''}`}
                onClick={generateReport}
                disabled={reportLoading}
              >
                {reportLoading ? (
                  <><span className="spinner" /> Generating...</>
                ) : (
                  '▶ Generate Report'
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {reportError && (
            <div className="report-error fade-in">
              ⚠️ {reportError}
            </div>
          )}

          {/* Results */}
          {reportResults && !reportError && (
            <div className="list-container fade-in">
              <div className="list-header">
                <div>
                  <h3>{reportTypeLabel[reportType]} Report</h3>
                  <p className="result-count">
                    {reportResults.count} record{reportResults.count !== 1 ? 's' : ''} found
                    {['login', 'reset'].includes(reportType)
                      ? ` · ${fromDate} → ${toDate}`
                      : reportType === 'expire'
                        ? ` · Expiring in ${expireDays} day(s)`
                        : ` · Inactive for >${inactiveDays} days`}
                  </p>
                </div>
                {reportResults.count > 0 && (
                  <button
                    className="csv-btn"
                    onClick={() => exportToCSV(csvFilename(), reportResults.records)}
                  >
                    ⬇ Save as CSV
                  </button>
                )}
              </div>

              {reportResults.count > 0 ? (
                <div className="table-responsive">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Display Name</th>
                        <th>Team / OU</th>
                        <th>
                          {reportType === 'login'  && 'Last Login Time'}
                          {reportType === 'reset'  && 'Password Reset Time'}
                          {reportType === 'expire' && 'Expiry Date'}
                          {reportType === 'inactive' && 'Last Login Time'}
                        </th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportResults.records.map((row, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{row.Username || 'Unknown'}</td>
                          <td>{row.DisplayName || 'N/A'}</td>
                          <td><span className="team-badge">{row.Team || 'Default'}</span></td>
                          <td className="time-col">{row.TimeDone || 'N/A'}</td>
                          <td>
                            <span className={`detail-badge ${reportType}`}>
                              {row.Detail || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <p>✨ No records found for the selected criteria.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;