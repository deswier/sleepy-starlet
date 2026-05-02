import { Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import CurrentSleep from "./CurrentSleep";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { loading: authLoading, user } = useAuth();
  const { children, loading: childrenLoading } = useChildren();

  // Wait for auth + children queries before deciding where to go.
  if (authLoading || (user && childrenLoading)) {
    return <div className="min-h-screen bg-hero" />;
  }
  if (children.length === 0) {
    return <Navigate to="/child/new" replace />;
  }
  return (
    <AppShell>
      <CurrentSleep />
    </AppShell>
  );
};

export default Index;
