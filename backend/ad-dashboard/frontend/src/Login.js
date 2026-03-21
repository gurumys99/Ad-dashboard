import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    axios.post('http://localhost:5000/api/login', { username, password }, {
      withCredentials: true
    })
      .then(res => {
        setLoading(false);
        if (res.data.success) {
          onLogin(res.data.user || username);
        }
      })
      .catch(err => {
        setLoading(false);
        setErrorMsg(err.response?.data?.error || 'Failed to connect to the authentication server.');
      });
  };

  return (
    <div className="login-wrapper">
      <div className="login-card fade-in-up">
        <div className="login-brand">
          <img src="/logo.png" alt="rProcess Logo" style={{ maxWidth: '220px', marginBottom: '15px' }} />
        </div>
        <p className="login-subtitle">Domain Administrators Only</p>

        {errorMsg && <div className="login-error slide-down">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="username">LDAP ID</label>
            <input
              type="text"
              id="username"
              placeholder="user@domain.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className={`login-submit-btn ${loading ? 'btn-loading' : ''}`} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In Securely'}
          </button>
        </form>
      </div>
      <div className="login-background"></div>
    </div>
  );
}

export default Login;
