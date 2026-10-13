import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

function App() {
  const [health, setHealth] = React.useState('vérification…');
  React.useEffect(() => {
    fetch('http://localhost:3000/health')
      .then((r) => r.json())
      .then(() => setHealth('API connectée'))
      .catch(() => setHealth('API indisponible'));
  }, []);
  return <main><h1>Utilitaire SaaS</h1><p>Lot 0 — Bootstrap</p><p>{health}</p></main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
