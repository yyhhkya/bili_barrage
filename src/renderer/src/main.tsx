import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'

// Self-hosted so no Google Fonts <link> ships and the CSP stays strict.
// Geist Mono only: it is used for character-by-character data, never for prose.
import '@fontsource-variable/geist-mono'
// The UI face. Rounded CJK with Latin coverage, so one family sets the whole
// interface. Ships as ~94 unicode-range slices; the browser loads only the
// slices the UI actually renders.
import '@fontsource/zcool-kuaile'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
