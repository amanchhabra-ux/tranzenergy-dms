import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyOrgTheme, readCachedOrg } from './utils/org'

// paint with the organisation's colours from the last visit; the workspace refreshes them
applyOrgTheme(readCachedOrg())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
