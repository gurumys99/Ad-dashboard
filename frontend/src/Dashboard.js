import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
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

const todayStr = () => new Date().toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedListTitle, setSelectedListTitle] = useState('');
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const [dashFromDate, setDashFromDate] = useState(todayStr());
  const [dashToDate, setDashToDate] = useState(todayStr());
  const [showHistoryToggle, setShowHistoryToggle] = useState(false);

  // Custom Reports state
  const [reportType, setReportType] = useState('login');
  const [reportFromDate, setReportFromDate] = useState(todayStr());
  const [reportToDate, setReportToDate] = useState(todayStr());
  const [expireDays, setExpireDays] = useState('5');
  const [inactiveDays, setInactiveDays] = useState('10');
  const [selectedTeam, setSelectedTeam] = useState('All');
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportResults, setReportResults] = useState(null);
  const [reportError, setReportError] = useState('');

  const fetchDashboardData = useCallback(() => {
    setLoading(true);
    axios.get(`http://localhost:5000/api/dashboard?fromDate=${dashFromDate}&toDate=${dashToDate}`, { withCredentials: true })
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
        if (err.response && err.response.status === 401) {
          alert('Session expired. Please log in again.');
          onLogout();
        }
      });
  }, [dashFromDate, dashToDate, onLogout]);

  useEffect(() => { 
    if (activeTab === 'overview' || activeTab === 'analytics') fetchDashboardData(); 
  }, [dashFromDate, dashToDate, activeTab, fetchDashboardData]);

  const selectedUsers = useMemo(() => {
    if (!selectedListTitle) return [];
    if (selectedListTitle.includes('LOGINS'))   return data.loginRangeUsers || [];
    if (selectedListTitle.includes('LOCKED'))   return data.accountLockedRangeUsers || [];
    if (selectedListTitle.includes('RESETS'))   return data.resetDoneRangeUsers || [];
    if (selectedListTitle.includes('EXPIRING')) return data.expireIn5DaysUsers || [];
    if (selectedListTitle.includes('INACTIVE')) return data.inactive10DaysUsers || [];
    return [];
  }, [selectedListTitle, data]);

  const fetchTeams = useCallback(() => {
    if (teams.length > 0) return;
    setTeamsLoading(true);
    axios.get('http://localhost:5000/api/teams', { withCredentials: true })
      .then(res => {
        setTeams(res.data.teams || []);
      })
      .finally(() => setTeamsLoading(false));
  }, [teams]);

  const handleLogoutClick = () => {
    axios.post('http://localhost:5000/api/logout', {}, { withCredentials: true })
      .finally(() => onLogout());
  };

  const showList = (title) => {
    if (selectedListTitle && selectedListTitle !== title) {
      setIsAnimatingOut(true);
      setTimeout(() => {
        setSelectedListTitle(title);
        setIsAnimatingOut(false);
      }, 300);
    } else {
      setSelectedListTitle(title);
    }
  };

  const closeList = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setSelectedListTitle('');
      setIsAnimatingOut(false);
    }, 300);
  };

  const toggleHistory = () => {
    if (showHistoryToggle) { setDashFromDate(todayStr()); setDashToDate(todayStr()); }
    setShowHistoryToggle(!showHistoryToggle);
  };

  const generateReport = () => {
    setReportLoading(true);
    setReportResults(null);
    setReportError('');
    const payload = { reportType, expireDays, team: selectedTeam };
    if (reportType === 'inactive') payload.inactiveDays = inactiveDays;
    if (['login', 'reset'].includes(reportType)) {
      payload.fromDate = reportFromDate;
      payload.toDate   = reportToDate;
    }
    axios.post('http://localhost:5000/api/custom-report', payload, { withCredentials: true })
      .then(res => { setReportResults(res.data); })
      .catch(err => { setReportError(err.response?.data?.error || 'Failed to generate report.'); })
      .finally(() => setReportLoading(false));
  };

  const reportTypeLabel = { login: 'Login Data', reset: 'Password Reset', expire: 'Password Expiry', inactive: 'Inactive Users' };
  const csvFilename = () => {
    const base = reportTypeLabel[reportType] || 'Report';
    if (reportType === 'expire') return `${base}_Expire${expireDays}Days_${todayStr()}.csv`;
    if (reportType === 'inactive') return `${base}_Inactive${inactiveDays}Days_${todayStr()}.csv`;
    return `${base}_${reportFromDate}_to_${reportToDate}.csv`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-container">

      <div className="dashboard-header">
        <div>
          <h1>Active Directory Tracker</h1>
          <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Welcome, <strong>{user}</strong>! (Domain Admin)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="refresh-btn" style={{ backgroundColor: '#ef4444' }} onClick={handleLogoutClick}>Sign Out</button>
        </div>
      </div>

      <div className="tab-nav">
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>📊 Overview</button>
        <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>📈 Analytics</button>
        <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => { setActiveTab('reports'); fetchTeams(); }}>📋 Custom Reports</button>
      </div>

      {activeTab === 'overview' && (
        <div className="fade-in">
          <div className="dashboard-controls-revert">
             <div className="mode-selector">
                <span className="current-mode">Timeline: <strong>{showHistoryToggle ? 'History Look-up' : "Today's Telemetry"}</strong></span>
                <button className={`toggle-history-btn ${showHistoryToggle ? 'active' : ''}`} onClick={toggleHistory}>{showHistoryToggle ? 'Back to Today' : '📅 Set Range'}</button>
             </div>
             {showHistoryToggle && (
                <div className="date-input-group slide-in">
                    <input type="date" value={dashFromDate} onChange={e => setDashFromDate(e.target.value)} />
                    <span className="sep">-</span>
                    <input type="date" value={dashToDate} onChange={e => setDashToDate(e.target.value)} />
                </div>
             )}
             <button className="sync-btn-revert" onClick={fetchDashboardData} disabled={loading}>{loading ? 'Processing...' : '↻ Sync Data'}</button>
          </div>

          <div className="metrics-grid">
            <div className="metric-card green" onClick={() => showList(showHistoryToggle ? 'TOTAL LOGINS (RANGE)' : 'TOTAL LOGINS (TODAY)')}>
              <div className="metric-title">Logins</div>
              <div className="metric-value">{data.totalLoginRange || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>
            <div className="metric-card locked" onClick={() => showList(showHistoryToggle ? 'TOTAL LOCKED (RANGE)' : 'TOTAL LOCKED (TODAY)')}>
              <div className="metric-title">Attempts Locked</div>
              <div className="metric-value">{data.totalAccountLockedRange || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>
            <div className="metric-card resets" onClick={() => showList(showHistoryToggle ? 'TOTAL RESETS (RANGE)' : 'TOTAL RESETS (TODAY)')}>
              <div className="metric-title">Resets Done</div>
              <div className="metric-value">{data.totalResetDoneRange || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>
            <div className="metric-card warning" onClick={() => showList('EXPIRING (5 DAYS)')}>
              <div className="metric-title">Expiring 5 Days</div>
              <div className="metric-value">{data.passwordExpireIn5Days || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>
            <div className="metric-card inactive" onClick={() => showList('INACTIVE (10 DAYS)')}>
              <div className="metric-title">Inactive 10 Days</div>
              <div className="metric-value">{data.totalInactive10Days || 0}</div>
              <div className="metric-subtitle">Click to view records</div>
            </div>
          </div>


          {selectedListTitle && (
            <div className={`list-container ${isAnimatingOut ? 'fade-out' : 'fade-in'}`}>
              <div className="list-header"><h3>{selectedListTitle}</h3><button className="close-btn" onClick={closeList}>×</button></div>
              {selectedUsers.length > 0 ? (
                <div className="table-responsive"><table className="modern-table"><thead><tr><th>Username</th><th>Display Name</th><th>Team</th><th>System Time</th></tr></thead><tbody>{selectedUsers.map((u, idx) => (<tr key={idx}><td className="font-medium">{u.Username || 'Unknown'}</td><td>{u.DisplayName || 'N/A'}</td><td><span className="team-badge">{u.Team || 'Default'}</span></td><td className="time-col">{u.TimeDone || 'N/A'}</td></tr>))}</tbody></table></div>
              ) : <div className="empty-state"><p>✨ No users found matching this criteria.</p></div>}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ANALYTICS TAB (NEW)                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="analytics-view fade-in">
          <div className="analytics-grid">
            
            {/* 1. Login Distribution per OU */}
            <div className="chart-card-full">
              <div className="chart-header"><h3>Logins by Organizational Unit</h3><p>Activity distribution across teams</p></div>
              <div className="chart-content-bg">
                {data.distribution?.logins && data.distribution.logins.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.distribution.logins} layout="vertical" margin={{ left: 40, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="team" type="category" stroke="#475569" fontSize={12} width={120} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '10px' }} />
                      <Bar dataKey="count" name="Logins" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="trend-empty">No distribution data available.</div>}
              </div>
            </div>

            {/* 2. Security Trends: Logins vs Failures (Locks) */}
            <div className="chart-card-full">
              <div className="chart-header"><h3>Security Event Timeline</h3><p>Tracking Logins vs Account Lockouts (Failures)</p></div>
              <div className="chart-content-bg">
                {data.loginTrend && data.loginTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data.loginTrend}>
                       <defs>
                          <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                          <linearGradient id="colorLocks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                       <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => v.split('-').slice(1).join('/')} />
                       <YAxis stroke="#94a3b8" fontSize={11} />
                       <Tooltip />
                       <Legend align="right" verticalAlign="top" height={36}/>
                       <Area type="monotone" dataKey="logins" name="Success" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLogins)" strokeWidth={2} />
                       <Area type="monotone" dataKey="locks" name="Lockouts (Failures)" stroke="#ef4444" fillOpacity={1} fill="url(#colorLocks)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="trend-empty">Generating security timeline...</div>}
              </div>
            </div>

            {/* 3. Account Health Distribution */}
            <div className="chart-card-half">
              <div className="chart-header"><h3>Account Health Distribution</h3><p>Overall state of directory objects</p></div>
              <div className="chart-content-bg flex-center">
                {data.distribution?.status ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={data.distribution.status} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {data.distribution.status.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="trend-empty">No status data.</div>}
              </div>
            </div>

            {/* 4. Resets by Team */}
            <div className="chart-card-half">
              <div className="chart-header"><h3>Reset Activity by Team</h3><p>Where most password changes happen</p></div>
              <div className="chart-content-bg">
                {data.distribution?.resets && data.distribution.resets.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.distribution.resets}>
                      <XAxis dataKey="team" hide />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="count" name="Resets" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="trend-empty">No reset activity found.</div>}
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="report-panel fade-in">
          <div className="report-filter-card">
            <h3 className="report-filter-title">🔍 Report Configuration</h3>
            <div className="filter-row">
              <div className="filter-group">
                <label className="filter-label">Report Type</label>
                <div className="report-type-selector">
                  {[{ key: 'login', icon: '🔐', label: 'Login Data' }, { key: 'reset', icon: '🔑', label: 'Password Reset' }, { key: 'expire', icon: '⏰', label: 'Password Expiry' }, { key: 'inactive', icon: '💤', label: 'Inactive Users' }].map(opt => (
                    <button key={opt.key} className={`type-chip ${reportType === opt.key ? 'active' : ''}`} onClick={() => { setReportType(opt.key); setReportResults(null); setReportError(''); }}>{opt.icon} {opt.label}</button>
                  ))}
                </div>
              </div>
            </div>
            {['login', 'reset'].includes(reportType) && (
              <div className="filter-row">
                <div className="filter-group"><label className="filter-label">From Date</label><input type="date" className="filter-input" value={reportFromDate} max={reportToDate} onChange={e => setReportFromDate(e.target.value)} /></div>
                <div className="filter-group"><label className="filter-label">To Date</label><input type="date" className="filter-input" value={reportToDate} min={reportFromDate} onChange={e => setReportToDate(e.target.value)} /></div>
              </div>
            )}
            {reportType === 'expire' && (
              <div className="filter-row"><div className="filter-group"><label className="filter-label">Password Expires</label><select className="filter-input filter-select" value={expireDays} onChange={e => setExpireDays(e.target.value)}><option value="0">Today Only</option><option value="5">Next 5 Days</option><option value="10">Next 10 Days</option></select></div></div>
            )}
            {reportType === 'inactive' && (
              <div className="filter-row"><div className="filter-group"><label className="filter-label">Inactive Duration</label><select className="filter-input filter-select" value={inactiveDays} onChange={e => setInactiveDays(e.target.value)}><option value="5">Last 5 Days</option><option value="10">Last 10 Days</option><option value="30">Last 30 Days</option></select></div></div>
            )}
            <div className="filter-row"><div className="filter-group"><label className="filter-label">Team / OU</label><select className="filter-input filter-select" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} disabled={teamsLoading}><option value="All">All Teams</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></div></div>
            <div className="filter-actions">
              <button className={`generate-btn ${reportLoading ? 'loading' : ''}`} onClick={generateReport} disabled={reportLoading}>{reportLoading ? (<><span className="spinner" /> Generating...</>) : '▶ Generate Report'}</button>
            </div>
          </div>
          {reportError && <div className="report-error fade-in">⚠️ {reportError}</div>}
          {reportResults && !reportError && (
            <div className="list-container fade-in">
              <div className="list-header"><div><h3>{reportTypeLabel[reportType]} Report</h3><p className="result-count">{reportResults.count} record{reportResults.count !== 1 ? 's' : ''} found</p></div>{reportResults.count > 0 && (<button className="csv-btn" onClick={() => exportToCSV(csvFilename(), reportResults.records)}>⬇ Save as CSV</button>)}</div>
              {reportResults.count > 0 ? (
                <div className="table-responsive"><table className="modern-table"><thead><tr><th>Username</th><th>Display Name</th><th>Team / OU</th><th>Timestamp</th><th>Detail</th></tr></thead><tbody>{reportResults.records.map((row, idx) => (<tr key={idx}><td className="font-medium">{row.Username || 'Unknown'}</td><td>{row.DisplayName || 'N/A'}</td><td><span className="team-badge">{row.Team || 'Default'}</span></td><td className="time-col">{row.TimeDone || 'N/A'}</td><td><span className={`detail-badge ${reportType}`}>{row.Detail || '—'}</span></td></tr>))}</tbody></table></div>
              ) : <div className="empty-state"><p>✨ No records found for the selected criteria.</p></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;