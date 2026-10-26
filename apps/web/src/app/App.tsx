import { createBrowserRouter, RouterProvider } from "react-router";
import { ButtonLink } from "../components/Button";
import { Screen } from "../components/Screen";
import { BuildingScreen } from "../features/building/BuildingScreen";
import { CoachScreen } from "../features/coach/CoachScreen";
import { GuideScreen } from "../features/guide/GuideScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { ReportScreen } from "../features/report/ReportScreen";

function NotFound() {
  return (
    <Screen>
      <h1>That page isn&apos;t here</h1>
      <ButtonLink to="/" block>
        Back to guides
      </ButtonLink>
    </Screen>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <HomeScreen />, errorElement: <NotFound /> },
  { path: "/guides/:id", element: <GuideScreen /> },
  { path: "/guides/:id/building", element: <BuildingScreen /> },
  { path: "/coach/:sessionId", element: <CoachScreen /> },
  { path: "/report/:sessionId", element: <ReportScreen /> },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
