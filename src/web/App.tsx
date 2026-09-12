import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NewTrip } from "./screens/NewTrip.tsx";
import { Planner } from "./screens/Planner.tsx";
import { Trip } from "./screens/Trip.tsx";
import { Trips } from "./screens/Trips.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Trips />} />
        <Route path="/new" element={<NewTrip />} />
        <Route path="/trip/:slug" element={<Trip />} />
        <Route path="/trip/:slug/plan" element={<Planner />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
