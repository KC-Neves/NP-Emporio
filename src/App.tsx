import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import ErrorBoundary from "./components/base/ErrorBoundary";
import { ToastProvider } from "./contexts/ToastContext";
import ToastContainer from "./components/base/ToastContainer";

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <BrowserRouter basename={__BASE_PATH__}>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
        <ToastContainer />
      </ToastProvider>
    </I18nextProvider>
  );
}

export default App;