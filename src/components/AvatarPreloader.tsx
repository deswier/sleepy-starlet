import { useChildren } from "@/contexts/ChildContext";

// Keeps the active child's photo decoded and resident so AppShell remounts
// during back-swipe paint the photo in the same frame as the initials.
// SwipeBackHost re-mounts AppShell twice per back-swipe (behind layer at
// drag-start, front layer when navigate(-1) resolves), and a freshly-created
// <img> needs to fetch + decode before it paints — visible as an "initials
// → photo" flash during the gesture. A live <img> with the same src keeps
// the browser's decoded image data warm; the AppShell <img> then paints
// instantly from that shared decode.
export default function AvatarPreloader() {
  const { activeChild } = useChildren();
  if (!activeChild?.photo_url) return null;
  return (
    <img
      src={activeChild.photo_url}
      alt=""
      aria-hidden
      decoding="sync"
      style={{
        position: "fixed",
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
        top: 0,
        left: 0,
      }}
    />
  );
}
