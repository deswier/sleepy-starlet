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
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NewChild from "./pages/NewChild";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Conflicts from "./pages/Conflicts";
import Heatmap from "./pages/Heatmap";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ChildProvider>
            <RouteTracker />
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
          </ChildProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
