import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, type Location } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChildProvider } from "@/contexts/ChildContext";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import RouteTracker from "@/components/RouteTracker";
import SwipeBackHost from "@/components/SwipeBackHost";


const Index     = lazy(() => import("./pages/Index"));
const Auth      = lazy(() => import("./pages/Auth"));
const NewChild  = lazy(() => import("./pages/NewChild"));
const History   = lazy(() => import("./pages/History"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings  = lazy(() => import("./pages/Settings"));
const Conflicts = lazy(() => import("./pages/Conflicts"));
const Heatmap   = lazy(() => import("./pages/Heatmap"));
const Profile   = lazy(() => import("./pages/Profile"));
const DeletedChildren = lazy(() => import("./pages/DeletedChildren"));
const NotFound  = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30s window where data is considered fresh — re-renders within this
      // window read from cache instead of refetching. Realtime subscriptions
      // explicitly invalidate when the underlying data changes.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      // Refetch when the app returns to the foreground: mobile browsers and
      // iOS PWAs drop the Realtime WebSocket while hidden, and events
      // emitted meanwhile — e.g. a sleep ended on another device — would
      // otherwise stay invisible. staleTime still gates: fresh data
      // (<30s since last fetch) is served from cache without a network hit.
      refetchOnWindowFocus: true,
    },
  },
});
const fallback = <div className="min-h-screen bg-hero" />;

// Rendered twice during an active swipe-back: once with the current location
// (front layer) and once with the frozen previous location (behind layer).
// When `location` is undefined, <Routes> falls back to the router context's
// current location.
function AppRoutes({ location }: { location?: Location }) {
  return (
    <Suspense fallback={fallback}>
      <Routes location={location}>
        <Route path="/auth" element={<Auth />} />
        <Route path="/child/new" element={<RequireAuth><NewChild /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/conflicts" element={<RequireAuth><Conflicts /></RequireAuth>} />
        <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
        <Route path="/history" element={<RequireAuth><AppShell><History /></AppShell></RequireAuth>} />
        <Route path="/analytics" element={<RequireAuth><AppShell><Analytics /></AppShell></RequireAuth>} />
        <Route path="/heatmap" element={<RequireAuth><Heatmap /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/deleted-children" element={<RequireAuth><DeletedChildren /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const renderAppRoutes = (location?: Location) => <AppRoutes location={location} />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ChildProvider>
            <RouteTracker />
            <SwipeBackHost renderRoutes={renderAppRoutes} />
          </ChildProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
