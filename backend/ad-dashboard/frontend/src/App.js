import React, { useState } from 'react';
import Dashboard from './Dashboard';
import Login from './Login';

function App() {
  const [user, setUser] = useState(localStorage.getItem('ad_user') || null);

  const handleLogout = () => {
    localStorage.removeItem('ad_user');
    setUser(null);
  };

  const handleLogin = (loggedInUser) => {
    localStorage.setItem('ad_user', loggedInUser);
    setUser(loggedInUser);
  };

  return (
    <div>
      {user ? (
          <Dashboard user={user} onLogout={handleLogout} />
      ) : (
          <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;