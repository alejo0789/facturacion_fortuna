// IMPORTANTE: el fetchInterceptor lee de localStorage; debe importarse primero
// para que CUALQUIER fetch (incluso el primero al montar componentes) ya vaya
// con los headers de sesión.
import './fetchInterceptor';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import AuthProvider from './auth/AuthContext';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>,
);
