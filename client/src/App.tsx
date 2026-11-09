import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AllocationPage } from './pages/AllocationPage';
import { ExceptionsPage } from './pages/ExceptionsPage';
import { ExplorerPage } from './pages/ExplorerPage';
import { ForecastPage } from './pages/ForecastPage';
import { OverviewPage } from './pages/OverviewPage';
import { ReproducibilityPage } from './pages/ReproducibilityPage';
import { SchemaPage } from './pages/SchemaPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="forecasts" element={<ForecastPage />} />
          <Route path="allocation" element={<AllocationPage />} />
          <Route path="exceptions" element={<ExceptionsPage />} />
          <Route path="explorer" element={<ExplorerPage />} />
          <Route path="reproducibility" element={<ReproducibilityPage />} />
          <Route path="schema" element={<SchemaPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
