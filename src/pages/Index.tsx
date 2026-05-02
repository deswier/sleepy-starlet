import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import CurrentSleep from "./CurrentSleep";
import { useChildren } from "@/contexts/ChildContext";

const Index = () => {
  const { children, activeChild, loading } = useChildren();

  // While we're still resolving children, render the shell (which has a header)
  // instead of a blank screen.
  if (loading) {
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
