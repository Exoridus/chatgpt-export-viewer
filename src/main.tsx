import '@fontsource-variable/inter/wght.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './App'
import { AppDataProvider } from './state/AppDataContext'
import { ImportExportProvider } from './state/ImportExportContext'
import { NotificationProvider } from './state/NotificationContext'
import { PreferencesProvider } from './state/PreferencesContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <NotificationProvider>
        <PreferencesProvider>
          <ImportExportProvider>
            <AppDataProvider>
              <App />
            </AppDataProvider>
          </ImportExportProvider>
        </PreferencesProvider>
      </NotificationProvider>
    </HashRouter>
  </React.StrictMode>,
)
