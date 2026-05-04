import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChildProvider } from "@/contexts/ChildContext";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import RouteTracker from "@/components/RouteTracker";


const Index     = lazy(() => import("./pages/Index"));
const Auth      = lazy(() => import("./pages/Auth"));
const NewChild  = lazy(() => import("./pages/NewChild"));
const History   = lazy(() => import("./pages/History"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings  = lazy(() => import("./pages/Settings"));
const Conflicts = lazy(() => import("./pages/Conflicts"));
const Heatmap   = lazy(() => import("./pages/Heatmap"));
const Profile   = lazy(() => import("./pages/Profile"));
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
      refetchOnWindowFocus: false,
    },
  },
});
const fallback = <div className="min-h-screen bg-hero" />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ChildProvider>
            <RouteTracker />
            <Suspense fallback={fallback}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/child/new" element={<RequireAuth><NewChild /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route path="/conflicts" element={<RequireAuth><Conflicts /></RequireAuth>} />
                <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
                <Route path="/history" element={<RequireAuth><AppShell><History /></AppShell></RequireAuth>} />
                <Route path="/analytics" element={<RequireAuth><AppShell><Analytics /></AppShell></RequireAuth>} />
                <Route path="/heatmap" element={<RequireAuth><Heatmap /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ChildProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
